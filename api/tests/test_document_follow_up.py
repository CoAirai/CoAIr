"""A follow-up document question keeps the conversation.

The document route answered from the current question only, so "you answered
the total budget is £411.5M, where is this coming from" reached a model that
had never seen the earlier answer.
"""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import src.light_graph as light_graph
from src.conversation_store import Message, format_chat_context
from src.document_rag import answer_question_var, conversation_history_var
from src.router import QueryRouter

FOLLOW_UP = ("You answered the total project budget is £411.5M, "
             "where is this coming from?")


def _augmented():
    history = format_chat_context([
        Message(role="user", content="What was the total project budget?", timestamp="t1"),
        Message(role="assistant", content="The total project budget is £411.5M.",
                timestamp="t2"),
    ])
    return f"{history}\n\nCurrent question: {FOLLOW_UP}"


def _router(seen):
    def query(question, **_kwargs):
        seen.update(
            searched=question,
            history=conversation_history_var.get(),
            asked=answer_question_var.get(),
        )
        return {"answer": "The £411.5M figure is not in the excerpts.", "sources": []}

    r = QueryRouter.__new__(QueryRouter)
    r._jargon = SimpleNamespace(replace_query_terms_with_meanings=lambda q: q)
    r._resolve_filename_hints = lambda topic: []
    r.compute_query_scope = lambda q: {}
    r._allowed_data_tables = lambda: []
    r.data_analyzer = SimpleNamespace(select_tables=lambda *a, **k: [], tables={},
                                      file_paths={})
    r.document_rag = SimpleNamespace(file_registry={}, query=query)
    return r


def test_document_answer_sees_the_earlier_turns(monkeypatch):
    monkeypatch.setattr(light_graph, "get_light_graph",
                        lambda: SimpleNamespace(search_by_topic=lambda *a, **k: []))
    seen = {}
    _router(seen)._handle_document_query(_augmented())

    assert "£411.5M" in seen["history"]
    assert seen["asked"] == FOLLOW_UP
    assert seen["searched"].startswith("What was the total project budget?")
    assert conversation_history_var.get() == ""
    assert answer_question_var.get() == ""


def test_self_contained_questions_are_searched_as_asked():
    history = "User: What was the total project budget?\nAssistant: £411.5M."
    question = "Which contractor delivered the Haymarket depot roof works in 2011?"
    assert QueryRouter._follow_up_topic(question, history) == question
    assert QueryRouter._follow_up_topic("and the second one?", "") == "and the second one?"
