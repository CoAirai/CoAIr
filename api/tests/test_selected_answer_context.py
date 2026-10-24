"""Selected source text reaches synthesis without becoming a search query."""
import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from backend.services.chat_orchestrator import ChatOrchestrator
from src.document_rag import DocumentRAG, answer_context_var


SELECTED = "--- DOCUMENT: notice.pdf ---\nAB AB AB: original evidence.\n--- END notice.pdf ---"


class SelectedAnswerContextTests(unittest.TestCase):
    def test_metadata_enrichment_obeys_the_selected_document_ids(self):
        from src.router import QueryRouter
        router = QueryRouter.__new__(QueryRouter)
        router._jargon = SimpleNamespace(replace_query_terms_with_meanings=lambda query: query)
        router._resolve_filename_hints = lambda query: ['notice.pdf']
        router._rerank_sources = lambda sources, *args: sources
        router.document_rag = SimpleNamespace(file_registry={}, query=lambda *args, **kwargs: {
            'answer': 'The notice records the scope.',
            'sources': [dict(doc_id='d1', file_name='notice.pdf', page_number=1)],
        })
        router.data_analyzer = SimpleNamespace(get_tables_for_doc_ids=lambda ids: [])
        graph = SimpleNamespace(search_by_topic=lambda *args, **kwargs: [
            dict(doc_id='d1', file_name='notice.pdf'), dict(doc_id='d2', file_name='other.pdf')])
        with patch('src.light_graph.get_light_graph', return_value=graph), \
             patch('src.document_rag._current_user_corpus', return_value=''):
            result = router._handle_document_query('What does notice.pdf say?', doc_ids=['d1'])
        self.assertTrue(result['sources'])
        self.assertTrue(all(source['doc_id'] == 'd1' for source in result['sources']))
        self.assertTrue(all(source.get('type') != 'notice' for source in result['sources']))

    def test_canonical_citation_id_is_resolved_only_within_the_active_project(self):
        from backend.services.response_builder import _resolve_canonical_doc_id
        from src.project_context import current_project_id_var
        records = [SimpleNamespace(project_id='b', file_name='notice.pdf', doc_id='foreign'),
                   SimpleNamespace(project_id='a', file_name='notice.pdf', doc_id='local')]
        registry = SimpleNamespace(get_all=lambda project_id=None: [record for record in records
            if project_id is None or record.project_id == project_id])
        token = current_project_id_var.set('a')
        try:
            with patch('src.document_registry.get_document_registry', return_value=registry):
                self.assertEqual(_resolve_canonical_doc_id('notice.pdf', 'raw'), 'local')
                current_project_id_var.set('empty')
                self.assertEqual(_resolve_canonical_doc_id('notice.pdf', 'raw'), 'raw')
                current_project_id_var.set('')
                self.assertEqual(_resolve_canonical_doc_id('notice.pdf', 'raw'), 'raw')
        finally:
            current_project_id_var.reset(token)

    def test_orchestrator_keeps_selected_text_out_of_router_and_restores_context(self):
        async def run(fail=False, dual=False):
            messages = []
            seen = {}
            store = SimpleNamespace(
                add_message=lambda conversation_id, message: messages.append(message),
                get_recent_messages=lambda *args: messages,
                list_conversations=lambda: [], get_document_ids=lambda *args: [],
            )

            def route(query, doc_ids, mode, email_ids):
                seen.update(query=query, docs=doc_ids, context=answer_context_var.get())
                if fail:
                    raise RuntimeError('controlled router failure')
                return {'query_type': 'document', 'answer': 'Grounded answer', 'sources': []}

            orchestrator = ChatOrchestrator()
            def route_dual(*args):
                raw = route(*args)
                return {'query_type': 'document', 'answers': {'gemini': raw, 'openai': raw}}

            token = answer_context_var.set('parent-context')
            try:
                with patch.object(orchestrator, '_build_document_context', return_value=SELECTED), \
                     patch('backend.services.chat_orchestrator.ENABLE_DUAL_PROVIDER', dual), \
                     patch('backend.services.chat_orchestrator.LLM_PROVIDERS', ['gemini', 'openai']), \
                     patch('src.run_store.get_run_store', return_value=MagicMock()), \
                     patch('src.interaction_log.get_interaction_log', return_value=MagicMock()):
                    await orchestrator.process(query='What does the notice say?', conversation_id='c',
                        router=SimpleNamespace(route_and_execute=route, route_and_execute_dual=route_dual), store=store,
                        doc_ids=['d1'], project_id='project-a', project_role='editor')
                self.assertEqual(seen['query'], 'What does the notice say?')
                self.assertEqual(seen['docs'], ['d1'])
                self.assertEqual(seen['context'], SELECTED)
                self.assertEqual(answer_context_var.get(), 'parent-context')
            finally:
                answer_context_var.reset(token)

        for dual in (False, True):
            for fail in (False, True):
                with self.subTest(router_failure=fail, dual=dual):
                    asyncio.run(run(fail, dual))

    def test_synthesis_receives_original_selected_text_with_source_excerpts(self):
        captured = {}

        def generate(prompt, **kwargs):
            captured['prompt'] = prompt
            return SimpleNamespace(text='Grounded answer')

        token = answer_context_var.set(SELECTED)
        try:
            with patch('src.llm_client.generate_text', side_effect=generate):
                result = object.__new__(DocumentRAG)._synthesize_from_nodes('What does it say?', [
                    {'file_name': 'notice.pdf', 'page_number': 1, 'text': 'original evidence'},
                ])
            self.assertEqual(result, 'Grounded answer')
            self.assertIn(SELECTED, captured['prompt'])
            self.assertIn('[Source 1: notice.pdf, p.1]', captured['prompt'])
            self.assertIn('QUESTION: What does it say?', captured['prompt'])
        finally:
            answer_context_var.reset(token)

    def test_provider_and_named_document_paths_keep_selected_evidence(self):
        prompts = []
        rag = object.__new__(DocumentRAG)
        rag.index = MagicMock()
        rag.index.as_retriever.return_value.retrieve.return_value = [SimpleNamespace(
            text='original evidence', metadata={'file_name': 'notice.pdf', 'page_number': 1,
                                              'doc_id': 'd1'}, score=1.0)]
        rag._fetch_named_doc_chunks = lambda *args, **kwargs: [dict(text='original evidence',
            metadata={'file_name': 'notice.pdf', 'page_number': 1, 'doc_id': 'd1'})]

        def generate(prompt, **kwargs):
            prompts.append(prompt)
            return SimpleNamespace(text='Grounded answer')

        token = answer_context_var.set(SELECTED)
        try:
            with patch('src.llm_client.generate_text', side_effect=generate):
                rag._query_with_direct_synthesis('Question', 'gemini', project_id='a')
                rag.query_named_docs_with_provider('Question', 'gemini', ['notice.pdf'],
                                                  top_k_semantic=0, project_id='a')
            self.assertEqual(len(prompts), 2)
            for prompt in prompts:
                self.assertIn(SELECTED, prompt)
                self.assertIn('[Source 1: notice.pdf, p.1]', prompt)
        finally:
            answer_context_var.reset(token)


if __name__ == '__main__':
    unittest.main()
