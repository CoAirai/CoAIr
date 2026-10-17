"""A false-premise question keeps its denial.

"What did Dr Helena Vasquez-Iddon conclude in her programme impact report?"
names a person who is not in the corpus. Retrieval answered "no mention of
Helena Vasquez-Iddon", but a topic match on "programme impact report" made the
router replace that with "Found 35 related document(s)", so the trick question
looked answered.
"""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.light_graph as light_graph
from backend.services.response_builder import build_chat_response
from src.router import QueryRouter

DENIAL = ('There is no mention of "Helena Vasquez-Iddon" or any impact report '
          "authored by her in the provided documents.")
QUESTION = "What did Dr Helena Vasquez-Iddon conclude in her programme impact report?"


def _router(answer):
    r = QueryRouter.__new__(QueryRouter)
    r._jargon = SimpleNamespace(replace_query_terms_with_meanings=lambda q: q)
    r._resolve_filename_hints = lambda topic: []
    r.compute_query_scope = lambda q: {}
    r._allowed_data_tables = lambda: []
    r.data_analyzer = SimpleNamespace(select_tables=lambda *a, **k: [], tables={},
                                      file_paths={})
    r.document_rag = SimpleNamespace(
        file_registry={},
        query=lambda *a, **k: {"answer": answer, "sources": [
            {"file_name": "CEC00111623.pdf", "page_number": 23, "doc_id": "d1"},
        ]},
    )
    return r


def _graph(monkeypatch):
    graph = SimpleNamespace(search_by_topic=lambda topic, limit=20: [
        {"doc_id": "report-1", "file_name": "programme-report.pdf"},
        {"doc_id": "report-2", "file_name": "impact-review.pdf"},
    ])
    monkeypatch.setattr(light_graph, "get_light_graph", lambda: graph)


def test_topic_matches_do_not_replace_a_denial(monkeypatch):
    _graph(monkeypatch)
    result = _router(DENIAL)._handle_document_query(QUESTION)

    assert result["answer"] == DENIAL
    response = build_chat_response(result)
    assert "Vasquez-Iddon" in response.assistant_text
    assert "related document" not in response.assistant_text
    assert response.citations == []


def test_an_empty_answer_still_reports_what_was_found(monkeypatch):
    _graph(monkeypatch)
    result = _router("")._handle_document_query(QUESTION)

    assert result["answer"].startswith("Found **")
