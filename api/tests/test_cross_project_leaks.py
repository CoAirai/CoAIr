"""
Fail-closed scoping: an empty scope must mean *nothing*, never *everything*.

Three surfaces used to fall back to the whole platform when the active project
had nothing of its own — the library listing, the DuckDB table allow-list, and
the classifier prompt inventory. Each fallback was reachable by any user who
simply created a project. These tests pin the closed behaviour and, at the same
time, fence the one legacy account whose data predates projects and is still
addressed by its corpus tag.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.project_context import set_current_project


@pytest.fixture(autouse=True)
def _clear_scope():
    set_current_project("")
    yield
    set_current_project("")


# ── DuckDB table allow-list ─────────────────────────────────


def _analyzer(tables):
    from src.data_analyzer_sql import DataAnalyzerSQL

    analyzer = DataAnalyzerSQL.__new__(DataAnalyzerSQL)
    analyzer.tables = tables
    return analyzer


def _router(analyzer):
    from src.router import QueryRouter

    router = QueryRouter.__new__(QueryRouter)
    router.data_analyzer = analyzer
    return router


TABLES = {
    "costs_a": {"project_id": "project-a", "corpus": "demo"},
    "costs_b": {"project_id": "project-b", "corpus": "demo"},
    "legacy_edinburgh": {"project_id": "", "corpus": "edinburgh"},
}


def test_project_allow_list_excludes_other_projects():
    analyzer = _analyzer(TABLES)
    assert analyzer.get_tables_for_project("project-a") == ["costs_a"]
    assert analyzer.get_tables_for_project("project-b") == ["costs_b"]


def test_empty_project_scope_returns_no_tables_not_all_tables():
    analyzer = _analyzer(TABLES)
    assert analyzer.get_tables_for_project("") == []
    assert analyzer.get_tables_for_project(None) == []


def test_data_route_allow_list_is_project_scoped(monkeypatch):
    monkeypatch.setattr("src.document_rag._current_user_corpus", lambda: "")
    router = _router(_analyzer(TABLES))

    set_current_project("project-a")
    assert router._allowed_data_tables() == ["costs_a"]


def test_scoped_request_with_no_tables_of_its_own_gets_nothing():
    """The leak: project-c has no tables, so the old code fell through to every
    table registered in the process-wide DuckDB."""
    router = _router(_analyzer(TABLES))

    set_current_project("project-c")
    assert router._allowed_data_tables() == []


def test_legacy_corpus_account_still_reaches_its_tables(monkeypatch):
    monkeypatch.setattr("src.document_rag._current_user_corpus", lambda: "edinburgh")
    router = _router(_analyzer(TABLES))

    # Its catalog entries carry no project_id, so the corpus tag is the only
    # boundary they have. Losing this is the regression that hides 122 tables.
    set_current_project("edinburgh-project")
    assert router._allowed_data_tables() == ["legacy_edinburgh"]


def test_unscoped_script_keeps_unrestricted_access(monkeypatch):
    monkeypatch.setattr("src.document_rag._current_user_corpus", lambda: "")
    router = _router(_analyzer(TABLES))

    set_current_project("")
    assert router._allowed_data_tables() is None


# ── Classifier prompt inventory ─────────────────────────────


def test_classification_context_is_project_scoped(monkeypatch):
    """Filenames, summaries and sampled cell values are rendered verbatim into
    the prompt, so the inventory must never span projects."""
    records = {
        "project-a": [SimpleNamespace(file_name="acme-contract.pdf", file_type="document",
                                      llm_summary="Acme scope of works")],
        "project-b": [SimpleNamespace(file_name="rival-claim.pdf", file_type="document",
                                      llm_summary="Rival delay claim")],
    }

    class _Registry:
        def get_completed(self, project_id=None):
            return records.get(project_id, [])

    monkeypatch.setattr("src.document_registry.get_document_registry", lambda: _Registry())
    monkeypatch.setattr("src.document_rag._current_user_corpus", lambda: "")

    analyzer = _analyzer(TABLES)
    analyzer.get_table_summary = lambda name: {"columns": ["cost"], "dtypes": {}, "row_count": 1}
    router = _router(analyzer)
    router.document_rag = SimpleNamespace(file_registry={})

    set_current_project("project-a")
    file_inventory, table_inventory = router._get_classification_context()

    assert "acme-contract.pdf" in file_inventory
    assert "rival-claim.pdf" not in file_inventory
    assert "costs_a" in table_inventory
    assert "costs_b" not in table_inventory


def test_topic_inventory_cache_is_keyed_by_project(monkeypatch):
    """The router is a process-wide singleton; a single cached block served one
    tenant's topics to the next request."""
    topics = {
        "project-a": [SimpleNamespace(llm_topics=["Zone 3 delay notices"])],
        "project-b": [SimpleNamespace(llm_topics=["Rival cost overrun"])],
    }

    class _Registry:
        def get_completed(self, project_id=None):
            return topics.get(project_id, [])

    monkeypatch.setattr("src.document_registry.get_document_registry", lambda: _Registry())

    router = _router(_analyzer(TABLES))
    router._topic_inventory_cache = {}

    set_current_project("project-a")
    first = router._get_topic_inventory()
    set_current_project("project-b")
    second = router._get_topic_inventory()

    assert "Zone 3 delay notices" in first
    assert "Rival cost overrun" in second
    assert "Zone 3 delay notices" not in second


# ── Library listing ─────────────────────────────────────────


class _EmptyRegistry:
    def get_completed(self, project_id=None):
        return []


def test_empty_project_library_is_empty_not_the_platform(monkeypatch):
    from backend.api import library

    monkeypatch.setattr("src.document_registry.get_document_registry", lambda: _EmptyRegistry())
    monkeypatch.setattr(library, "_vectors_only_library_docs", lambda *a, **k: [])

    user = SimpleNamespace(username="acme", features={})
    project = SimpleNamespace(project_id="project-empty")

    assert asyncio.run(library.list_library(user=user, project=project)) == []


def test_empty_project_summary_is_zero_not_the_platform(monkeypatch):
    from backend.api import library

    monkeypatch.setattr("src.document_registry.get_document_registry", lambda: _EmptyRegistry())
    monkeypatch.setattr(library, "_vectors_only_library_docs", lambda *a, **k: [])

    user = SimpleNamespace(username="acme", features={})
    project = SimpleNamespace(project_id="project-empty")

    assert asyncio.run(library.library_summary(user=user, project=project)) == {
        "total_files": 0, "by_file_type": {}, "by_doc_type": {}, "total_tables": 0,
    }


def test_legacy_corpus_account_still_sees_its_library(monkeypatch):
    from backend.api import library

    monkeypatch.setattr("src.document_registry.get_document_registry", lambda: _EmptyRegistry())
    monkeypatch.setattr(library, "_vectors_only_library_docs",
                        lambda names, project_id="", **k: ([] if project_id else ["bulk-doc"]))
    monkeypatch.setattr(library, "_edinburgh_data_library_docs", lambda *a, **k: ["spreadsheet"])

    user = SimpleNamespace(username="admin2", features={"corpus": "edinburgh"})
    project = SimpleNamespace(project_id="edinburgh-project")

    assert asyncio.run(
        library.list_library(user=user, project=project)
    ) == ["bulk-doc", "spreadsheet"]
