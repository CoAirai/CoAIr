"""Search memory can spill independently of the API's container budget."""
def test_search_connection_applies_operator_memory_and_thread_budget(tmp_path, monkeypatch):
    from src import chunk_store
    monkeypatch.setenv("COAIR_DUCKDB_MEMORY_LIMIT", "128MB")
    monkeypatch.setenv("COAIR_DUCKDB_THREADS", "1")
    monkeypatch.setattr(chunk_store, "CHUNKS_DIR", tmp_path)
    monkeypatch.setattr(chunk_store, "CHUNKS_DB", tmp_path / "chunks.db")
    monkeypatch.setattr(chunk_store.ChunkStore, "_instance", None)
    monkeypatch.setattr("src.gcs_storage.sync_chunks_from_gcs", lambda: None)
    store = chunk_store.ChunkStore()
    try:
        assert store._con.execute("SELECT current_setting('threads')").fetchone()[0] == 1
        assert "122.0 MiB" == store._con.execute("SELECT current_setting('memory_limit')").fetchone()[0]
        store._con.execute("CREATE TABLE resource_probe AS SELECT range i FROM range(10)")
        assert store._con.execute("SELECT count(*) FROM resource_probe").fetchone()[0] == 10
    finally:
        store._con.close()


def test_disk_failure_preserves_budget_in_memory_fallback(tmp_path, monkeypatch):
    from src import chunk_store
    monkeypatch.setenv("COAIR_DUCKDB_MEMORY_LIMIT", "128MB")
    monkeypatch.setenv("COAIR_DUCKDB_THREADS", "1")
    monkeypatch.setattr(chunk_store, "CHUNKS_DIR", tmp_path)
    monkeypatch.setattr(chunk_store, "CHUNKS_DB", tmp_path / "chunks.db")
    monkeypatch.setattr(chunk_store.ChunkStore, "_instance", None)
    monkeypatch.setattr("src.gcs_storage.sync_chunks_from_gcs", lambda: None)
    real_connect = chunk_store.duckdb.connect
    calls = []
    def connect(database, **kwargs):
        calls.append(database)
        if database != ":memory:":
            raise OSError("test disk unavailable")
        return real_connect(database, **kwargs)
    monkeypatch.setattr(chunk_store.duckdb, "connect", connect)
    store = chunk_store.ChunkStore()
    try:
        assert len(calls) == 2
        assert store._con.execute("SELECT current_setting('memory_limit')").fetchone()[0] == "122.0 MiB"
        assert store._con.execute("SELECT current_setting('threads')").fetchone()[0] == 1
    finally:
        store._con.close()


def test_invalid_budget_cannot_fall_back_to_unlimited_memory(tmp_path, monkeypatch):
    import pytest
    from src import chunk_store
    monkeypatch.setenv("COAIR_DUCKDB_MEMORY_LIMIT", "not-a-memory-size")
    monkeypatch.setattr(chunk_store, "CHUNKS_DIR", tmp_path)
    monkeypatch.setattr(chunk_store, "CHUNKS_DB", tmp_path / "chunks.db")
    monkeypatch.setattr(chunk_store.ChunkStore, "_instance", None)
    monkeypatch.setattr("src.gcs_storage.sync_chunks_from_gcs", lambda: None)
    with pytest.raises(Exception, match="memory|Memory|number"):
        chunk_store.ChunkStore()
    assert chunk_store.ChunkStore._instance is None
