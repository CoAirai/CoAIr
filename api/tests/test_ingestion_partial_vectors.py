"""A file is ready only when every chunk has a persisted embedding."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from llama_index.core import Document
from llama_index.core.schema import TextNode
from src.document_rag import DocumentRAG


class PartialVectorTests(unittest.TestCase):
    def run_insert(self, *, missing_embedding=False, fail_one=False):
        rag = DocumentRAG.__new__(DocumentRAG)
        rag.index = object()
        nodes = [TextNode(text='First chunk'), TextNode(text='Second chunk')]
        embed = Mock()
        embed.get_text_embedding_batch.return_value = [[0.1, 0.2], [0.3, 0.4]]
        if missing_embedding:
            embed.get_text_embedding_batch.side_effect = RuntimeError('embedding unavailable')
        def add(batch):
            if len(batch) > 1 or (fail_one and batch[0] is nodes[1]):
                raise RuntimeError('vector write unavailable')
        rag.vector_store = SimpleNamespace(add=Mock(side_effect=add))
        settings = SimpleNamespace(node_parser=SimpleNamespace(
            get_nodes_from_documents=lambda docs: nodes), embed_model=embed)
        with patch('src.document_rag.Settings', settings), \
             patch('src.jargon_manager.prepare_query', return_value=SimpleNamespace(matches=[], context='')), \
             patch('src.chunk_store.get_chunk_store', return_value=Mock()), \
             patch('time.sleep'):
            result = rag.insert_documents([Document(text='source')], project_id='test-project', file_id='test-file')
        return result, rag.vector_store.add.call_count

    def test_partial_upsert_is_not_ready(self):
        self.assertFalse(self.run_insert(fail_one=True)[0])

    def test_complete_sequential_recovery_is_ready(self):
        self.assertTrue(self.run_insert()[0])

    def test_missing_embeddings_are_not_upserted(self):
        result, calls = self.run_insert(missing_embedding=True)
        self.assertFalse(result)
        self.assertEqual(calls, 0)


if __name__ == '__main__':
    unittest.main()
