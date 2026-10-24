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
                                       ('d3', 'foreign.pdf', 'b')]]
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
    finally:
        client.close()
