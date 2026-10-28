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
