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


def test_agent_keeps_full_tool_evidence_and_hands_off_final_prose(monkeypatch):
    from src import react_agent
    agent = react_agent.ReActAgent(NS())
    actions = iter([{"action": "document_search", "action_input": "search", "thought": "private reasoning"},
                    {"action": "finish", "action_input": "incomplete controller draft"}])
    monkeypatch.setattr(agent, "_decide", lambda *a: next(actions))
    monkeypatch.setattr(agent, "_corpus_map", lambda *a: "metadata")
    monkeypatch.setattr(agent, "_budget_exhausted", lambda *a: False)
    source = {"doc_id": "owned", "file_name": "owned.pdf"}
    full = "background " * 500 + "LATE FACT: actual cost GBP 25."
    monkeypatch.setattr(agent, "_run_tool", lambda *a: (full, [source], {}))
    seen = []
    monkeypatch.setattr(agent, "_final_synthesis", lambda q, scratchpad:
                        (seen.extend(scratchpad) or "final checked answer"))
    events = []
    monkeypatch.setattr(react_agent, "_emit", lambda *a: events.append(a))
    result = agent.run("question", max_iterations=3)
    assert result["answer"] == "final checked answer"
    assert seen[0]["observation"] == full
    assert result["sources"][0]["doc_id"] == "owned"
    assert "private reasoning" not in str(events)


def test_controller_sees_only_bounded_previews_not_full_tool_evidence(monkeypatch):
    from src import react_agent
    seen = []
    monkeypatch.setattr(react_agent, "_record", lambda *a: None)
    monkeypatch.setattr(llm_client, "generate_json", lambda prompt, **kw:
                        (seen.append(prompt) or NS(text='{"action":"finish","action_input":""}')))
    agent = react_agent.ReActAgent(NS())
    agent._decide("question", [{"action":"document_search", "input":"query",
                               "observation":"prefix "*1000+"LATE SECRET MARKER"}])
    assert "LATE SECRET MARKER" not in seen[0]
    assert "Observation preview (may be incomplete)" in seen[0]
    assert "separate answer writer" in seen[0]


def test_agent_final_writer_receives_late_evidence_and_task_budget(monkeypatch):
    from src import react_agent
    from src.model_profiles import get_task_profile
    monkeypatch.setattr(react_agent, "_record", lambda *a: None)
    seen = []
    monkeypatch.setattr(llm_client, "generate_text", lambda prompt, **kw:
                        (seen.append((prompt,kw)) or NS(text="final answer")))
    result = react_agent.ReActAgent(NS())._final_synthesis("question", [
        {"action":"document_search", "observation":"padding "*700+"LATE FACT"}])
    assert result == "final answer" and "LATE FACT" in seen[0][0]
    assert seen[0][1].get("max_tokens", get_task_profile("answer_synthesis").max_output_tokens) == 8192


def test_plan_combiner_does_not_clip_findings_at_3000_characters(monkeypatch):
    from src.query_planner import PlanExecutor
    seen = []
    monkeypatch.setattr(llm_client, "generate_text", lambda prompt, **kw:
                        (seen.append(prompt) or NS(text="final answer")))
    result = PlanExecutor.__new__(PlanExecutor)._execute_combine_step("question", "compare", [0],
        {0: {"answer":"padding "*700+"LATE PLAN FACT", "sources":[{"doc_id":"owned"}]}})
    assert "LATE PLAN FACT" in seen[0]
    assert result["sources"] == [{"doc_id":"owned"}]


def test_retrieved_passages_are_not_dropped_after_the_sixth_chunk():
    from src.query_planner import PlanExecutor
    from src.react_agent import ReActAgent
    sources = [{"file_name":f"owned-{i}.pdf", "page_number":i,
                "text":f"FULL FACT {i}", "text_snippet":"short preview"} for i in range(12)]
    for render in (PlanExecutor._excerpts_from_sources, ReActAgent._excerpts):
        text = render(sources)
        assert "FULL FACT 11" in text and "owned-11.pdf" in text
        assert text.count("FULL FACT") == 12
