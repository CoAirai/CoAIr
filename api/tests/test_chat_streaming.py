"""Public streaming never exposes thoughts, skips accounting or accepts cutoffs."""
import asyncio
import json
from types import SimpleNamespace as NS

import pytest

from src import llm_client
from src.answer_stream import answer_stream_var


def _offline(monkeypatch):
    for name in ("enforce_budget", "_enforce_user_quota"):
        monkeypatch.setattr(llm_client, name, lambda: None)
    monkeypatch.setattr(llm_client, "_cache_get", lambda *a: None)
    monkeypatch.setattr(llm_client, "_record_run_usage", lambda *a: None)
    monkeypatch.setattr(llm_client, "_attribute_to_current_user", lambda *a, **k: None)
    monkeypatch.setattr(llm_client, "_google_api_key", lambda: "offline-only")
    charged, cached = [], []
    monkeypatch.setattr(llm_client, "record_usage", lambda *a: charged.append(a))
    monkeypatch.setattr(llm_client, "_cache_set", lambda *a: cached.append(a))
    return charged, cached


@pytest.mark.parametrize("finish", ["STOP", "MAX_TOKENS", None])
def test_native_public_deltas_and_usage(monkeypatch, finish):
    from google import genai
    charged, cached = _offline(monkeypatch)
    chunks = [NS(candidates=[NS(content=NS(parts=[NS(text="hidden thought", thought=True),
                NS(text="Public ", thought=False)]), finish_reason=None)], usage_metadata=None),
              NS(candidates=[NS(content=NS(parts=[NS(text="answer", thought=False)]), finish_reason=finish)],
                 usage_metadata=NS(prompt_token_count=20, candidates_token_count=8,
                                   thoughts_token_count=4, cached_content_token_count=0))]
    # A usage-only tail chunk must not erase the earlier finish reason.
    chunks.append(NS(candidates=[], usage_metadata=chunks[-1].usage_metadata))
    closed = []
    monkeypatch.setattr(genai, "Client", lambda **kw: NS(
        models=NS(generate_content_stream=lambda **kw: iter(chunks)), close=lambda: closed.append(True)))
    events = []
    token = answer_stream_var.set(events.append)
    try:
        if finish == "STOP":
            result = llm_client.generate_text("question", task_type="document_synthesis")
            assert result.text == "Public answer"
            assert result.usage.reasoning_tokens == 4
        else:
            with pytest.raises(llm_client.LLMIncompleteResponseError):
                llm_client.generate_text("question", task_type="document_synthesis")
    finally:
        answer_stream_var.reset(token)
    assert "hidden thought" not in json.dumps(events)
    assert [e["text"] for e in events if e["type"] == "answer_delta"] == ["Public ", "answer"]
    assert len(charged) == 1 and charged[0][:2] == (20, 12)
    assert bool(cached) == (finish == "STOP")
    assert closed == [True]


def test_internal_structured_calls_cannot_stream(monkeypatch):
    events = []
    seen = []
    def generate(*a, **kw):
        seen.append(answer_stream_var.get())
        return NS(usage=NS(cache_hit=False))
    monkeypatch.setattr(llm_client, "_generate_text", generate)
    token = answer_stream_var.set(events.append)
    try:
        llm_client.generate_text("private schema", task_type="answer_evidence_review", json_mode=True)
        assert answer_stream_var.get() == events.append
    finally:
        answer_stream_var.reset(token)
    assert seen == [None] and not events


def test_sse_preserves_activity_and_authoritative_completion():
    from backend.services.chat_stream import stream_chat
    from backend.tasks.query_progress import query_progress, report_step, query_request_var
    async def exercise():
        async def run(rid):
            query_progress.start(rid)
            token = query_request_var.set(rid)
            try:
                def work():
                    report_step("searching", "Searching project evidence")
                    answer_stream_var.get()({"type": "answer_delta", "text": "draft"})
                await asyncio.to_thread(work)
                return NS(model_dump=lambda **kw: {"assistant_text": "verified replacement", "citations": []})
            finally:
                query_request_var.reset(token)
        response = stream_chat(run)
        frames = [part async for part in response.body_iterator]
        events = [json.loads(part.removeprefix("data: ").strip()) for part in frames]
        assert any(e["type"] == "activity" for e in events)
        assert any(e.get("text") == "draft" for e in events)
        assert events[-1]["response"]["assistant_text"] == "verified replacement"
    asyncio.run(exercise())


def test_concurrent_streams_keep_their_own_text():
    from backend.services.chat_stream import stream_chat
    async def exercise():
        async def collect(name):
            async def run(rid):
                await asyncio.to_thread(lambda: answer_stream_var.get()({"type": "answer_delta", "text": name}))
                return NS(model_dump=lambda **kw: {"assistant_text": name})
            response = stream_chat(run)
            return [json.loads(frame.removeprefix("data: ").strip()) async for frame in response.body_iterator]
        first, second = await asyncio.gather(collect("project-a"), collect("project-b"))
        assert {e["text"] for e in first if "text" in e} == {"project-a"}
        assert {e["text"] for e in second if "text" in e} == {"project-b"}
    asyncio.run(exercise())


def test_disconnect_does_not_discard_the_running_accounted_turn():
    from backend.services.chat_stream import stream_chat
    async def exercise():
        finished = asyncio.Event()
        async def run(rid):
            answer_stream_var.get()({"type": "answer_delta", "text": "public draft"})
            await asyncio.sleep(.01)
            finished.set()
            return NS(model_dump=lambda **kw: {"assistant_text": "saved answer"})
        response = stream_chat(run)
        await anext(response.body_iterator)
        await response.body_iterator.aclose()
        await asyncio.wait_for(finished.wait(), timeout=2)
        await asyncio.sleep(.05)
    asyncio.run(exercise())


def test_midstream_budget_error_retains_payment_status():
    from backend.services.chat_stream import stream_chat
    from src.usage_tracker import BudgetExceededError
    async def exercise():
        async def run(rid):
            raise BudgetExceededError("AI budget exhausted")
        response = stream_chat(run)
        events = [json.loads(frame.removeprefix("data: ").strip()) async for frame in response.body_iterator]
        assert events[-1] == {"type": "error", "status": 402, "message": "AI budget exhausted"}
    asyncio.run(exercise())


def test_long_review_keeps_final_activity_without_unbounded_history(monkeypatch):
    from backend.tasks import query_progress as progress_module
    from backend.services.chat_stream import stream_chat
    monkeypatch.setattr(progress_module, "_STEP_CAP", 3)
    async def exercise():
        async def run(rid):
            progress_module.query_progress.start(rid)
            for index in range(12):
                progress_module.query_progress.add(rid, "reading", "Reviewing sources", str(index))
            progress_module.query_progress.add(rid, "answer", "Writing the answer")
            activity = progress_module.query_progress.get(rid)
            assert len(activity.steps) == 3
            assert [s.seq for s in activity.steps] == [10, 11, 12]
            return NS(model_dump=lambda **kw: {"assistant_text": "complete"})
        response = stream_chat(run)
        events = [json.loads(frame.removeprefix("data: ").strip()) async for frame in response.body_iterator]
        assert any(e.get("kind") == "answer" and e["label"] == "Writing the answer" for e in events)
    asyncio.run(exercise())


def test_agent_tool_narratives_are_not_public_final_text(monkeypatch):
    from src.react_agent import ReActAgent
    from src.answer_stream import publish_answer
    agent = ReActAgent(NS())
    actions = iter([{"action":"sql_query","action_input":"query"},
                    {"action":"finish","action_input":""}])
    monkeypatch.setattr(agent, "_decide", lambda *a: next(actions))
    monkeypatch.setattr(agent, "_corpus_map", lambda *a: "metadata")
    monkeypatch.setattr(agent, "_budget_exhausted", lambda *a: False)
    def tool(*a):
        publish_answer("answer_delta", text="internal SQL narrative")
        return "tool findings", [], {}
    def final(*a):
        publish_answer("answer_delta", text="public final answer")
        return "public final answer"
    monkeypatch.setattr(agent, "_run_tool", tool)
    monkeypatch.setattr(agent, "_final_synthesis", final)
    events = []
    token = answer_stream_var.set(events.append)
    try:
        result = agent.run("question", max_iterations=3)
        assert answer_stream_var.get() == events.append
    finally:
        answer_stream_var.reset(token)
    assert result["answer"] == "public final answer"
    assert events == [{"type":"answer_delta","text":"public final answer"}]


def test_plan_streams_only_its_terminal_step(monkeypatch):
    from src.query_planner import PlanExecutor, PlanStep, QueryPlan
    from src.answer_stream import publish_answer
    executor = PlanExecutor.__new__(PlanExecutor)
    def intermediate(*a, **kw):
        publish_answer("answer_delta", text="internal plan narrative")
        return {"answer":"tool findings","sources":[]}
    def final(*a, **kw):
        publish_answer("answer_delta", text="terminal answer")
        return {"answer":"terminal answer","sources":[]}
    monkeypatch.setattr(executor, "_execute_sql_step", intermediate)
    monkeypatch.setattr(executor, "_execute_combine_step", final)
    plan = QueryPlan("question", [PlanStep(0,"sql","query","query"),
        PlanStep(1,"combine","combine","combine",depends_on=[0])])
    events = []
    token = answer_stream_var.set(events.append)
    try:
        result = executor.execute(plan)
        assert answer_stream_var.get() == events.append
    finally:
        answer_stream_var.reset(token)
    assert result["answer"] == "terminal answer"
    assert events == [{"type":"answer_delta","text":"terminal answer"}]
