import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

class PilotRegressions(unittest.TestCase):
    def test_full_question_reaches_document_answerer(self):
        from src.router import QueryRouter
        router=QueryRouter.__new__(QueryRouter)
        router._jargon=SimpleNamespace(replace_query_terms_with_meanings=lambda q:q)
        router._resolve_filename_hints=Mock(return_value=['pilot.pdf'])
        router.document_rag=SimpleNamespace(query=Mock(return_value={'answer':'Alice approved it','sources':[]}))
        router.data_analyzer=SimpleNamespace(get_tables_for_doc_ids=lambda _:[])
        question='Who approved the North Quay work and on what date?'
        with patch('src.light_graph.get_light_graph',return_value=Mock()),patch('src.document_rag._current_user_corpus',return_value='edinburgh'):
            router._handle_document_query(question,doc_ids=['doc'])
        self.assertEqual(router.document_rag.query.call_args.args[0],question)
        self.assertEqual(router.document_rag.query.call_args.kwargs['doc_ids'],['doc'])

    def test_preview_uses_project_review_text(self):
        from backend.services.document_service import DocumentService
        from backend.models.responses import DocContent
        rec=SimpleNamespace(doc_id='doc',file_name='scan.pdf',file_path='/project/scan.pdf')
        registry=Mock();registry.get_all.return_value=[rec]
        service=DocumentService();service._resolve_scoped_path=Mock(return_value=rec.file_path)
        service._serve_by_extension=Mock(return_value=DocContent(type='pdf',page=1,text='',image_base64='image'))
        with patch('src.document_registry.get_document_registry',return_value=registry),patch('src.document_review.ReviewStore') as reviews:
            reviews.return_value.get.return_value={'pages':{'1':'Corrected OCR text'}}
            result=service._get_project_content('doc','page_1','','project')
            reviews.return_value.get.assert_called_once_with('project','doc')
        self.assertEqual(result.text,'Corrected OCR text')
        self.assertEqual(result.image_base64,'image')

    def test_company_project_paths_do_not_open_sibling_project(self):
        import tempfile
        from pathlib import Path
        from backend.services.document_service import DocumentService
        with tempfile.TemporaryDirectory() as folder:
            data=Path(folder);own=data/'companies/acme/one';other=data/'companies/acme/two'
            own.mkdir(parents=True);other.mkdir(parents=True)
            (own/'scan.pdf').write_bytes(b'own');(other/'private.pdf').write_bytes(b'private')
            with patch('src.config.DATA_DIR',data),patch('src.tenant_paths.company_project_root',return_value=own):
                self.assertEqual(DocumentService._resolve_scoped_path(str(own/'scan.pdf'),'scan.pdf','one',allow_shared=False),str(own/'scan.pdf'))
                self.assertEqual(DocumentService._resolve_scoped_path(str(other/'private.pdf'),'private.pdf','one',allow_shared=False),'')

    def test_report_retry_reuses_evidence_only_for_same_corpus(self):
        from src.ai_reports import _generate_chronology_v2
        from src import chronology_v2 as v
        from src.evidence_model import EvidenceItem
        source=EvidenceItem(source_id='s',doc_id='doc',file_name='scan.pdf',excerpt='A notice was issued')
        plan=v.PreparedChronologyQuery('topic','topic',(),(),(),(),(),('query',))
        saved={}
        def load(key,digest):return saved.get((key,digest))
        def save(key,digest,status,output,error):saved[(key,digest)]={'status':status,'output':output}
        class ExtractReached(Exception):pass
        args=dict(project_id='p',project_name='Pilot',topic='topic',source_doc_ids=['doc'],load_step=load,save_step=save)
        with patch.object(v,'_corpus_revision',return_value='v1') as revision,patch.object(v,'prepare_chronology_query',return_value=plan) as planner,patch.object(v,'evidence_from_documents',return_value=[source]) as retrieve,patch.object(v,'extract_batches',side_effect=ExtractReached),patch('src.ai_reports.select_pack',return_value=SimpleNamespace(evidence=[source],stats={})):
            for _ in range(2):
                with self.assertRaises(ExtractReached):_generate_chronology_v2(**args)
            self.assertEqual(planner.call_count,1);self.assertEqual(retrieve.call_count,1)
            revision.return_value='v2'
            with self.assertRaises(ExtractReached):_generate_chronology_v2(**args)
            self.assertEqual(retrieve.call_count,2)
