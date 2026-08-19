"""Empty-output recovery when thinking eats the whole output budget.

Gemini 3 draws reasoning tokens from ``max_output_tokens``. A tight budget with
medium thinking returns zero visible text and ``finish_reason=MAX_TOKENS``,
which used to bubble all the way to the chat orchestrator as the generic
"I'm having trouble processing your query" fallback.
"""

from types import SimpleNamespace

import pytest

from src import llm_client


def _offline(monkeypatch):
    monkeypatch.setattr(llm_client, "_GENAI_AVAILABLE", True)
    monkeypatch.setattr(llm_client, "_cache_get", lambda _key: None)
    monkeypatch.setattr(llm_client, "_cache_set", lambda *_a, **_k: None)
    monkeypatch.setattr(llm_client, "enforce_budget", lambda: None)
    monkeypatch.setattr(llm_client, "_enforce_user_quota", lambda: None)
    monkeypatch.setattr(llm_client, "record_usage", lambda *_a: None)
    monkeypatch.setattr(llm_client, "_record_run_usage", lambda *_a: None)
    monkeypatch.setattr(llm_client, "_attribute_to_current_user", lambda *_a, **_k: None)


def _truncated_response():
    return SimpleNamespace(candidates=[SimpleNamespace(finish_reason="MAX_TOKENS")])


def test_empty_max_tokens_retries_without_thinking(monkeypatch):
    _offline(monkeypatch)
    calls = []

    def fake_native(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            # All 1024 tokens went to thoughts, nothing visible came back.
            return "", 5000, 0, 1024, 0, _truncated_response()
        return "the answer", 5000, 300, 0, 0, SimpleNamespace()

    monkeypatch.setattr(llm_client, "_gemini_generate_native", fake_native)

    response = llm_client.generate_text(
        "question", system="sys", max_tokens=1024, task_type="document_synthesis",
    )

    assert response.text == "the answer"
    assert len(calls) == 2
    assert calls[0]["thinking_level"] == "medium"
    assert calls[1]["thinking_level"] == "minimal"
    assert calls[0]["max_tokens"] == 1024
    assert calls[1]["max_tokens"] == 4096


def test_degrade_happens_only_once(monkeypatch):
    _offline(monkeypatch)
    calls = []

    def fake_native(**kwargs):
        calls.append(kwargs)
        return "", 5000, 0, 1024, 0, _truncated_response()

    monkeypatch.setattr(llm_client, "_gemini_generate_native", fake_native)

    with pytest.raises(llm_client.LLMIncompleteResponseError):
        llm_client.generate_text(
            "question", system="sys", max_tokens=1024, task_type="document_synthesis",
        )

    assert len(calls) == 2


def test_non_empty_max_tokens_still_fails_fast(monkeypatch):
    """Truncation with visible text is a real incomplete answer, not a budget bug."""
    _offline(monkeypatch)
    calls = []

    def fake_native(**kwargs):
        calls.append(kwargs)
        return "half an ans", 5000, 1024, 0, 0, _truncated_response()

    monkeypatch.setattr(llm_client, "_gemini_generate_native", fake_native)

    with pytest.raises(llm_client.LLMIncompleteResponseError):
        llm_client.generate_text("question", task_type="document_synthesis")

    assert len(calls) == 1


def test_document_synthesis_uses_chat_answer_budget(monkeypatch):
    """The RAG synthesis call must not inherit the 1024-token generic profile."""
    from src.document_rag import DocumentRAG

    captured = {}

    def fake_generate_text(prompt, **kwargs):
        captured.update(kwargs)
        captured["prompt"] = prompt
        return SimpleNamespace(text="answer", usage=None)

    monkeypatch.setattr(llm_client, "generate_text", fake_generate_text)

    rag = DocumentRAG.__new__(DocumentRAG)
    answer = DocumentRAG._synthesize_from_nodes(
        rag, "what happened?",
        [{"file_name": "a.pdf", "page_number": 1, "text": "excerpt"}],
    )

    assert answer == "answer"
    assert captured["task_type"] == "document_synthesis"
    assert "max_tokens" not in captured
    profile = llm_client.get_task_profile("document_synthesis")
    assert profile.max_output_tokens == 8_192
