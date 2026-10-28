import time

import pytest

import src.chunk_store as chunk_store_module
import src.gcs_storage as gcs_storage
import src.lexical_index as lexical_module
from src.chunk_store import ChunkStore
from src.lexical_index import LexicalIndex


@pytest.fixture
def stores(tmp_path, monkeypatch):
    monkeypatch.setattr(chunk_store_module, "CHUNKS_DIR", tmp_path)
    monkeypatch.setattr(chunk_store_module, "CHUNKS_DB", tmp_path / "chunks.db")
    monkeypatch.setattr(gcs_storage, "sync_chunks_from_gcs", lambda: None)
    monkeypatch.setattr(gcs_storage, "schedule_object_sync", lambda *a, **k: None)
    monkeypatch.setattr(ChunkStore, "_instance", None)
    monkeypatch.setattr(LexicalIndex, "_instance", None)
    chunks = ChunkStore()
    chunks.add_chunks([
        {"doc_id": "d1", "file_name": "delay.pdf", "page_number": 1,
         "text": "tram delay caused by utility diversion works", "project_id": "p1"},
        {"doc_id": "d2", "file_name": "budget.pdf", "page_number": 2,
         "text": "budget approved by the council", "project_id": "p1"},
        {"doc_id": "d3", "file_name": "other.pdf", "page_number": 1,
         "text": "tram delay in another project", "project_id": "p2"},
    ])
    yield chunks, LexicalIndex()


def _wait_for_index(index: LexicalIndex, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    while index._fts_building or not index._fts_ready:
        if time.monotonic() > deadline:
            raise AssertionError("FTS index was not built in time")
        time.sleep(0.05)


def test_search_answers_before_the_index_exists(stores):
    _chunks, index = stores
    hits = index.search_chunks("utility diversion", project_id="p1")
    assert [hit["file_name"] for hit in hits] == ["delay.pdf"]


def test_warm_builds_a_bm25_index_scoped_to_the_project(stores):
    _chunks, index = stores
    index.warm()
    _wait_for_index(index)
    hits = index.search_chunks("tram delay", project_id="p1")
    assert [hit["file_name"] for hit in hits] == ["delay.pdf"]
    assert index._fts_available is True


def test_stale_index_keeps_serving_and_rebuilds_in_background(stores, monkeypatch):
    chunks, index = stores
    index.warm()
    _wait_for_index(index)
    monkeypatch.setattr(lexical_module, "_FTS_REBUILD_MIN_INTERVAL", 0.0)
    chunks.add_chunks([
        {"doc_id": "d4", "file_name": "claim.pdf", "page_number": 3,
         "text": "extension of time claim for tram delay", "project_id": "p1"},
    ])
    assert chunks.is_dirty()

    hits = index.search_chunks("tram delay", project_id="p1")
    assert hits, "a stale index must still answer while the rebuild runs"

    _wait_for_index(index)
    hits = index.search_chunks("extension claim", project_id="p1")
    assert "claim.pdf" in [hit["file_name"] for hit in hits]


def test_new_upload_cannot_be_marked_clean_by_an_older_build(stores):
    chunks, _ = stores
    revision = chunks.fts_revision()
    chunks.add_chunks([{"doc_id":"new", "file_name":"new.pdf", "page_number":1,
                        "text":"new utility evidence", "project_id":"p1"}])
    assert not chunks.mark_clean_if_unchanged(revision)
    assert chunks.is_dirty() and chunks._read_fts_dirty()


def test_failed_build_dirty_state_is_durable(stores):
    chunks, _ = stores
    chunks.mark_clean()
    chunks.mark_dirty()
    assert chunks._read_fts_dirty()


def test_restart_warm_reuses_clean_persisted_index(stores, monkeypatch):
    chunks, index = stores
    index.warm()
    _wait_for_index(index)
    assert not chunks._read_fts_dirty()
    real_connection = chunks.connection
    statements = []
    class Spy:
        def __init__(self): self.con = real_connection()
        def execute(self, sql, *args):
            statements.append(sql)
            return self.con.execute(sql, *args)
        def close(self): self.con.close()
        def __enter__(self): return self
        def __exit__(self, *args): self.close()
    monkeypatch.setattr(chunks, 'connection', Spy)
    monkeypatch.setattr(LexicalIndex, '_instance', None)
    restarted = LexicalIndex()
    restarted.warm()
    _wait_for_index(restarted)
    assert not any('create_fts_index' in sql for sql in statements)


def test_search_returns_while_background_build_is_waiting(stores, monkeypatch):
    import threading
    chunks, index = stores
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()
    def build():
        entered.set()
        try: release.wait(5)
        finally:
            index._fts_building = False
            finished.set()
    monkeypatch.setattr(index, '_build_fts', build)
    try:
        hits = index.search_chunks('utility', project_id='p1')
        assert entered.wait(1) and not release.is_set()
        assert hits and hits[0]['doc_id'] == 'd1'
    finally:
        release.set()
        assert finished.wait(5)
