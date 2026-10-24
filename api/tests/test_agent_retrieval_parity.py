"""Regressions for the first RAG retrieval port; no provider calls."""
from concurrent.futures import ThreadPoolExecutor
from contextvars import ContextVar
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier, RLock
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import duckdb

from src.chunk_store import ChunkStore
from src.lexical_index import LexicalIndex


def store_at(path):
    store = object.__new__(ChunkStore)
    store._db_lock = RLock()
    store._con = duckdb.connect(str(path))
    store._con.execute('CREATE TABLE IF NOT EXISTS chunks (chunk_id VARCHAR PRIMARY KEY, '
                       'doc_id VARCHAR, file_name VARCHAR, page_number INTEGER, '
                       'text VARCHAR, project_id VARCHAR)')
    store._ensure_document_index_schema()
    store._dirty = store._read_fts_dirty() if hasattr(store, "_read_fts_dirty") else True
    return store


class RetrievalParityTests(unittest.TestCase):
    def test_bm25_side_effecting_score_is_materialized_before_filtering(self):
        with TemporaryDirectory() as directory:
            store = store_at(Path(directory) / 'chunks.db')
            try:
                with patch.object(store, '_persist'):
                    store.add_chunks([dict(doc_id=doc, file_name=doc + '.pdf', page_number=1,
                        text='source text without query token', project_id=project)
                        for doc, project in [('a1', 'a'), ('a2', 'a'), ('b1', 'b')]])
                store._con.create_function('test_rank', lambda cid, query: 9.0,
                                           [str, str], float, side_effects=True)
                store._con.execute('CREATE SCHEMA fts_main_chunks')
                store._con.execute('CREATE MACRO fts_main_chunks.match_bm25(cid, q) AS test_rank(cid, q)')
                index = object.__new__(LexicalIndex)
                with patch('src.chunk_store.get_chunk_store', return_value=store), \
                     patch.object(index, '_ensure_fts', return_value=True):
                    rows = index.search_chunks('unmatchedtoken', project_id='a', doc_ids=['a1'])
                self.assertEqual([(row['doc_id'], row['lex_score']) for row in rows], [('a1', 9.0)])
            finally:
                store._con.close()

    def test_parallel_readers_do_not_steal_results(self):
        with TemporaryDirectory() as directory:
            store = store_at(Path(directory) / 'chunks.db')
            barrier = Barrier(8)

            def read(value):
                with store.connection() as con:
                    con.execute("SELECT ?, 'notice.pdf', ?", [value, value])
                    barrier.wait(timeout=10)
                    return con.fetchone()

            try:
                with ThreadPoolExecutor(max_workers=8) as pool:
                    rows = list(pool.map(read, range(64)))
                self.assertEqual(rows, [(i, 'notice.pdf', i) for i in range(64)])
                self.assertEqual(store.count(), 0)  # cursors never close the owner
            finally:
                store._con.close()

    def test_dirty_state_survives_restart_and_mutations(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'chunks.db'
            store = store_at(path)
            self.assertTrue(store.is_dirty())  # old database needs one rebuild
            store.mark_clean()
            store._con.close()
            store = store_at(path)
            self.assertFalse(store.is_dirty())
            with patch.object(store, '_persist'):
                self.assertEqual(store.add_chunks([dict(doc_id='a', file_name='a.pdf',
                    page_number=1, text='Edinburgh utilities', project_id='a')]), 1)
            store._con.close()
            store = store_at(path)
            self.assertTrue(store.is_dirty())
            store.mark_clean()
            with patch.object(store, '_persist'):
                self.assertEqual(store.delete_by_file('a.pdf', project_id='b'), 0)
                self.assertFalse(store.is_dirty())
                self.assertEqual(store.delete_by_file('a.pdf', project_id='a'), 1)
                self.assertTrue(store.is_dirty())
            store._con.close()
            store = store_at(path)
            self.assertTrue(store.is_dirty())
            store._con.close()

    def test_warm_index_reuse_and_dirty_rebuild(self):
        index = object.__new__(LexicalIndex)
        index._fts_lock = RLock()
        index._fts_ready = False
        index._fts_available = None
        from unittest.mock import MagicMock
        store = MagicMock()
        store.is_empty.return_value = False
        store.is_dirty.return_value = False
        con = store.connection.return_value
        con.execute.return_value.fetchone.return_value = (1,)
        with patch('src.chunk_store.get_chunk_store', return_value=store):
            self.assertTrue(index._ensure_fts())
            self.assertFalse(any('create_fts_index' in str(c) for c in con.execute.call_args_list))
            store.mark_clean.assert_not_called()
            con.close.assert_called_once()
            store.is_dirty.return_value = True
            self.assertTrue(index._ensure_fts())
            self.assertTrue(any('create_fts_index' in str(c) for c in con.execute.call_args_list))
            store.mark_clean.assert_called_once()
            store.checkpoint.assert_called_once()

    def test_workers_inherit_context_and_queries_are_deduplicated(self):
        from src.ai_reports import retrieve_evidence
        from src.project_context import get_current_project_id, set_current_project
        correlation = ContextVar('retrieval-test-correlation', default='missing')
        correlation.set('request-owner')
        seen = []

        def result(question, **kwargs):
            seen.append((question, get_current_project_id(), correlation.get()))
            return []

        rag = SimpleNamespace(query=lambda question, **kwargs: {'sources': result(question, **kwargs)})
        lexical = SimpleNamespace(search_chunks=result)
        try:
            with patch('src.document_rag.get_document_rag', return_value=rag), \
                 patch('src.lexical_index.get_lexical_index', return_value=lexical), \
                 patch('src.chunk_store.get_chunk_store', side_effect=RuntimeError('no neighbours')):
                self.assertEqual(retrieve_evidence('project-a', [' utilities ', 'utilities', '', 'delay']), [])
            self.assertCountEqual(seen, [('utilities', 'project-a', 'request-owner')] * 2 +
                                  [('delay', 'project-a', 'request-owner')] * 2)
        finally:
            set_current_project('')


if __name__ == '__main__':
    unittest.main()
