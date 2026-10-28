"""Project boundaries apply before retrieval, rendering and SQL execution."""
from types import SimpleNamespace
from unittest.mock import Mock

import duckdb
import pytest

from backend.services.document_service import DocumentService
from src.project_context import set_current_project


@pytest.fixture(autouse=True)
def clear_project():
    set_current_project("")
    yield
    set_current_project("")


@pytest.fixture
def chunks(monkeypatch):
    import src.document_registry
    import src.document_rag
    import src.catalog
    import src.chunk_store

    connection = duckdb.connect(":memory:")
    connection.execute("CREATE TABLE chunks (doc_id VARCHAR, file_name VARCHAR, "
                       "page_number INTEGER, text VARCHAR, project_id VARCHAR)")
    connection.execute("INSERT INTO chunks VALUES "
                       "('local-doc','same.pdf',1,'LOCAL_SOURCE','project-a'),"
                       "('other-doc','same.pdf',1,'FOREIGN_SOURCE','project-b'),"
                       "('legacy-doc','legacy.pdf',1,'UNASSIGNED_SOURCE','')")
    monkeypatch.setattr(src.document_registry, "get_document_registry",
                        lambda: SimpleNamespace(get_all=lambda **kw: []))
    monkeypatch.setattr(src.document_rag, "get_document_rag",
                        lambda: SimpleNamespace(file_registry={}))
    monkeypatch.setattr(src.catalog, "get_catalog", lambda: SimpleNamespace(entries={}))
    monkeypatch.setattr(src.chunk_store, "get_chunk_store",
                        lambda: SimpleNamespace(connection=lambda: connection))
    yield connection
    connection.close()


@pytest.mark.parametrize("doc_id,name", [("other-doc", ""), ("same.pdf", ""),
                                          ("unknown", "same.pdf"),
                                          ("legacy-doc", ""), ("unknown", "legacy.pdf")])
def test_empty_project_cannot_preview_foreign_or_unassigned_chunks(chunks, monkeypatch, doc_id, name):
    service = DocumentService()
    monkeypatch.setattr(service, "_resolve_scoped_path", lambda *a, **kw: "")
    content = service._get_content_sync(doc_id, "page_1", name, "project-empty")
    assert content.error == "Document not found"
    assert not content.text and not content.image_base64


def test_identical_filename_preview_returns_only_local_text(chunks, monkeypatch):
    service = DocumentService()
    monkeypatch.setattr(service, "_resolve_scoped_path", lambda *a, **kw: "")
    content = service._get_content_sync("same.pdf", "page_1", project_id="project-a")
    assert content.error is None and content.text == "LOCAL_SOURCE"


def test_notice_search_scopes_sql_before_limit_and_handles_identical_names(chunks):
    from src.light_graph import LightGraph
    chunks.execute("CREATE TABLE notices (doc_id VARCHAR, file_name VARCHAR, date VARCHAR, "
                   "sender VARCHAR, recipient VARCHAR, subject VARCHAR, doc_type VARCHAR, topics VARCHAR)")
    chunks.execute("INSERT INTO notices VALUES "
                   "('other-doc','same.pdf','2026-12-31','','','secret','letter','secret'),"
                   "('local-doc','same.pdf','2026-01-01','','','secret','letter','secret')")
    graph = LightGraph.__new__(LightGraph)
    graph._db = chunks
    graph._notices_table_ready = True
    rows = graph.search_by_topic("secret", limit=1, project_id="project-a")
    assert [r["doc_id"] for r in rows] == ["local-doc"]
    assert graph.search_by_topic("secret", project_id="project-empty") == []


@pytest.mark.parametrize("method", ["query", "query_with_provider"])
def test_explicit_foreign_table_and_empty_allowlist_never_reach_generation(method):
    from src.data_analyzer_sql import DataAnalyzerSQL
    analyzer = DataAnalyzerSQL.__new__(DataAnalyzerSQL)
    analyzer.tables = {"mine": {"project_id": "project-a"},
                       "theirs": {"project_id": "project-b"}}
    analyzer._generate_sql = Mock(side_effect=AssertionError("must not generate"))
    set_current_project("project-a")
    kwargs = {"provider": "gemini"} if method == "query_with_provider" else {}
    for selection in ({"table_name": "theirs"}, {"allowed_tables": []},
                      {"allowed_tables": ["theirs"]}):
        result = getattr(analyzer, method)("show secrets", **kwargs, **selection)
        assert result["sources"] == [] and result["sql"] is None
    analyzer._generate_sql.assert_not_called()


def test_generated_sql_cannot_reference_foreign_table_even_with_forged_allowlist():
    from src.data_analyzer_sql import DataAnalyzerSQL
    analyzer = DataAnalyzerSQL.__new__(DataAnalyzerSQL)
    analyzer.tables = {"mine": {"project_id": "project-a"},
                       "theirs": {"project_id": "project-b"}}
    analyzer.conn = Mock()
    set_current_project("project-a")
    with pytest.raises(ValueError):
        analyzer._execute_checked('SELECT * FROM theirs', allowed_tables=["mine", "theirs"])
    analyzer.conn.execute.assert_not_called()
    analyzer._execute_checked('SELECT * FROM mine')
    analyzer.conn.execute.assert_called_once_with('SELECT * FROM mine')


def test_unified_search_applies_project_to_registry_and_bulk_chunk_query(chunks, monkeypatch):
    from src.router import QueryRouter
    from src.document_rag import corpus_var
    monkeypatch.setattr("src.light_graph.get_light_graph", lambda: SimpleNamespace(
        search_by_topic=lambda *a, **kw: []))
    monkeypatch.setattr("src.catalog.get_catalog", lambda: SimpleNamespace(
        search_by_keyword=lambda *a, **kw: []))
    searched = []
    registry = SimpleNamespace(search_by_name=lambda topic, project_id: searched.append(project_id) or [],
                               get=lambda doc_id: None)
    monkeypatch.setattr("src.document_registry.get_document_registry", lambda: registry)
    monkeypatch.setattr("src.notice_extractor.get_notice_extractor", Mock(side_effect=RuntimeError("no notices")))
    router = QueryRouter.__new__(QueryRouter)
    router.document_rag = SimpleNamespace(query=Mock(return_value={"sources": []}))
    token = corpus_var.set("edinburgh")
    try:
        set_current_project("project-a")
        rows = router._unified_document_search("SOURCE")
        assert [r["doc_id"] for r in rows] == ["local-doc"]
        assert searched == ["project-a"]
        router.document_rag.query.assert_called_once_with("SOURCE", top_k=10, project_id="project-a", synthesize=False)
        set_current_project("project-empty")
        assert router._unified_document_search("SOURCE") == []
        set_current_project("")
        assert router._unified_document_search("SOURCE") == []
    finally:
        corpus_var.reset(token)


@pytest.mark.parametrize("method", ["find_threads", "get_thread_between", "get_latest_unanswered"])
def test_correspondence_and_draft_threads_never_use_other_projects(chunks, method):
    from src.light_graph import LightGraph
    from src.thread_builder import ThreadBuilder
    chunks.execute("CREATE TABLE notices (doc_id VARCHAR, file_name VARCHAR, date VARCHAR, "
                   "sender VARCHAR, recipient VARCHAR, subject VARCHAR, doc_type VARCHAR, actions VARCHAR)")
    chunks.execute("INSERT INTO notices VALUES "
                   "('other-doc','same.pdf','2026-12-31','Alice','Bob','FOREIGN_SUBJECT','letter',''),"
                   "('local-doc','same.pdf','2026-01-01','Alice','Bob','LOCAL_SUBJECT','letter','')")
    graph = LightGraph.__new__(LightGraph)
    graph._db = chunks
    graph._notices_table_ready = True
    builder = ThreadBuilder()
    builder._graph = graph
    builder._rag = SimpleNamespace(documents=[
        SimpleNamespace(metadata={"file_name": "same.pdf", "project_id": project}, text=text)
        for project, text in [("project-b", "FOREIGN_BODY"), ("project-a", "LOCAL_BODY")]])
    for project in ("project-a", "project-empty", ""):
        set_current_project(project)
        if method == "find_threads":
            messages = [m for t in builder.find_threads("Alice") for m in t.messages]
        elif method == "get_thread_between":
            messages = builder.get_thread_between("Alice", "Bob").messages
        else:
            messages = builder.get_latest_unanswered()
        assert [m.doc_id for m in messages] == (["local-doc"] if project == "project-a" else [])
        if messages:
            assert messages[0].subject == "LOCAL_SUBJECT"
            assert messages[0].body_preview == "LOCAL_BODY"
