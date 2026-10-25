"""Real Qdrant adapter: canonical file IDs survive LlamaIndex UUID payloads."""
from qdrant_client import QdrantClient
from llama_index.core import VectorStoreIndex
from llama_index.core.embeddings import MockEmbedding
from llama_index.core.schema import TextNode
from llama_index.vector_stores.qdrant import QdrantVectorStore

from src.document_rag import DocumentRAG


def test_selected_file_retrieval_and_agent_read_cannot_widen_by_filename(monkeypatch):
    monkeypatch.setattr('src.document_rag._current_user_corpus', lambda: '')
    client = QdrantClient(location=':memory:')
    store = QdrantVectorStore(client=client, collection_name='qualification')
    nodes = [TextNode(text='utilities diversion evidence', embedding=[.1, .2],
             metadata={'doc_id': doc, 'file_id': doc, 'file_name': name,
                       'project_id': project, 'page_number': 1})
             for doc, name, project in [('d1', 'one.pdf', 'a'), ('d2', 'two.pdf', 'a'),
                                       ('d3', 'foreign.pdf', 'b'), ('d4', 'one.pdf', 'b')]]
    store.add(nodes)
    rag = object.__new__(DocumentRAG)
    rag.index = VectorStoreIndex.from_vector_store(store, embed_model=MockEmbedding(embed_dim=2))
    try:
        rows = rag._dense_candidates('utilities', 10, ['d2'], None, project_id='a')
        assert [row['doc_id'] for row in rows] == ['d2']
        # An agent asking to read another filename cannot override the selection.
        assert rag._dense_candidates('utilities', 10, ['d2'], ['one.pdf'], project_id='a') == []
        assert rag._dense_candidates('utilities', 10, ['d3'], None, project_id='a') == []
        assert {row['doc_id'] for row in rag._dense_candidates('utilities', 10, None, None, project_id='a')} == {'d1', 'd2'}
        # Optional metadata retry may broaden topics, never the project boundary.
        monkeypatch.setattr('src.config.ENABLE_HYBRID_RETRIEVAL', False)
        def unavailable_glossary():
            raise RuntimeError('no glossary for this isolated test')
        monkeypatch.setattr('src.jargon_manager.get_jargon_manager', unavailable_glossary)
        result = rag.query('utilities', synthesize=False, rerank=False, project_id='a',
                           payload_filters={'project_id': 'b', 'doc_type': 'absent'})
        assert {row['doc_id'] for row in result['sources']} == {'d1', 'd2'}

    finally:
        client.close()


def test_legacy_vectors_require_unambiguous_project_owned_selection(monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr('src.document_rag._current_user_corpus', lambda: '')
    records = [SimpleNamespace(doc_id='canonical',file_name='selected.pdf',project_id='a')]
    registry = SimpleNamespace(get_all=lambda project_id: [r for r in records if r.project_id==project_id])
    monkeypatch.setattr('src.document_registry.get_document_registry', lambda: registry)
    client = QdrantClient(location=':memory:')
    store = QdrantVectorStore(client=client,collection_name='legacy-qualification')
    nodes = [TextNode(text='selected utilities evidence',embedding=[.1,.2],metadata={
        'file_name':'selected.pdf','project_id':'a','page_number':1}),
        TextNode(text='foreign project',embedding=[.1,.2],metadata={
        'file_name':'selected.pdf','project_id':'b','page_number':1}),
        TextNode(text='other modern file',embedding=[.1,.2],metadata={
        'file_name':'selected.pdf','file_id':'other-file','project_id':'a','page_number':1})]
    store.add(nodes)
    rag=object.__new__(DocumentRAG)
    rag.index=VectorStoreIndex.from_vector_store(store,embed_model=MockEmbedding(embed_dim=2))
    try:
        rows=rag._dense_candidates('utilities',10,['canonical'],None,project_id='a')
        assert [r['text'] for r in rows] == ['selected utilities evidence']
        assert rag._dense_candidates('utilities',10,['canonical'],['other.pdf'],project_id='a') == []
        assert rag._dense_candidates('utilities',10,['canonical'],None,project_id='b') == []
        records.append(SimpleNamespace(doc_id='collision',file_name='selected.pdf',project_id='a'))
        assert rag._dense_candidates('utilities',10,['canonical'],None,project_id='a') == []
    finally:
        client.close()
