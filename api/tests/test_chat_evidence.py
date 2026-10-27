"""Large selected evidence is reviewed without an oversized synthesis prompt."""
from contextvars import ContextVar
from types import SimpleNamespace as NS

import pytest

from src import chat_evidence, llm_client


def test_small_context_preserves_single_accepted_call(monkeypatch):
    seen = []
    monkeypatch.setattr(llm_client, "generate_text", lambda prompt, **kw:
                        (seen.append((prompt, kw)) or NS(text="answer")))
    result = chat_evidence.synthesize_sources("question", [{"file_name": "a.pdf", "page_number": 2, "text": "evidence"}],
        render_prompt=lambda c: "PREFIX\n" + c + "\nQUESTION", system="accepted system")
    assert result.text == "answer" and len(seen) == 1
    assert seen[0][0] == "PREFIX\n[Source 1: a.pdf, p.2]\nevidence\nQUESTION"
    assert seen[0][1]["system"] == "accepted system"


def test_every_late_window_is_reviewed_in_bounded_inherited_context(monkeypatch):
    current = ContextVar("scope", default="missing")
    token = current.set("project-a/user-a")
    seen, writers = [], []
    source = ("background " * 60000) + "LATE FACT: approved on 28 October 2026."
    def review(prompt, **kw):
        assert current.get() == "project-a/user-a"
        assert len(prompt) < 13000
        seen.append(prompt)
        text = prompt.split("\n", 3)[-1]
        # Exact source-local quotation, never an invented summary.
        quote = "LATE FACT: approved on 28 October 2026."
        return NS(raw={"quotations": [quote] if quote in text else []})
    monkeypatch.setattr(llm_client, "generate_response_json", review)
    def write(prompt, **kw):
        writers.append(prompt)
        assert len(prompt) < 33000
        return NS(text="28 October 2026 [a.pdf, p.9]")
    monkeypatch.setattr(llm_client, "generate_text", write)
    try:
        result = chat_evidence.synthesize_sources("When approved?", [{"file_name": "a.pdf", "page_number": 9, "text": source}],
            render_prompt=lambda c: c)
    finally:
        current.reset(token)
    assert len(seen) > 50 and "28 October 2026" in result.text
    assert len(writers) == 1 and "p.9" in writers[0]


def test_invented_quotation_is_rejected(monkeypatch):
    monkeypatch.setattr(llm_client, "generate_response_json", lambda *a, **k: NS(raw={"quotations": ["invented date"]}))
    with pytest.raises(ValueError, match="absent"):
        chat_evidence._review("question", ("source", "real source"))


def test_output_cutoff_splits_existing_quotes_without_research_restart(monkeypatch):
    monkeypatch.setattr(chat_evidence, "DIRECT_CHARS", 1)
    reviewed, written = [], []
    def review(question, item):
        reviewed.append(item)
        return [item[0] + "\nfirst fact", item[0] + "\nsecond fact"]
    monkeypatch.setattr(chat_evidence, "_review", review)
    def write(prompt, **kw):
        written.append(prompt)
        if "first fact" in prompt and "second fact" in prompt:
            raise llm_client.LLMIncompleteResponseError("model_output_incomplete")
        return NS(text="first fact" if "first fact" in prompt else "second fact")
    monkeypatch.setattr(llm_client, "generate_text", write)
    result = chat_evidence.synthesize_sources("question", [{"file_name": "a.pdf", "text": "source"}], render_prompt=lambda c: c)
    assert len(reviewed) == 1 and len(written) == 3
    assert "first fact" in result.text and "second fact" in result.text


def test_auth_failure_never_splits_or_restarts(monkeypatch):
    seen = []
    def fail(*a, **kw):
        seen.append(True)
        raise PermissionError("provider authorization")
    monkeypatch.setattr(llm_client, "generate_text", fail)
    with pytest.raises(PermissionError):
        chat_evidence.synthesize_sources("question", [{"text": "source"}], render_prompt=lambda c: c)
    assert len(seen) == 1
