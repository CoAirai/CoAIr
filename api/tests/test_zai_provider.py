from types import SimpleNamespace

import pytest

from src import llm_client


def _offline(monkeypatch):
    monkeypatch.setattr(llm_client, "primary_llm_provider", lambda: "zai")
    monkeypatch.setattr(llm_client, "_cache_get", lambda _key: None)
    monkeypatch.setattr(llm_client, "_cache_set", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(llm_client, "enforce_budget", lambda: None)
    monkeypatch.setattr(llm_client, "_enforce_user_quota", lambda: None)
    monkeypatch.setattr(llm_client, "record_usage", lambda *_args: None)
    monkeypatch.setattr(llm_client, "_record_run_usage", lambda *_args: None)


def test_zai_routes_chat_to_glm(monkeypatch):
    _offline(monkeypatch)
    captured = {}

    def fake_create(provider, temperature, max_tokens, thinking=0, model=""):
        captured.update({
            "provider": provider,
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
        })
        llm = SimpleNamespace(
            chat=lambda messages: SimpleNamespace(
                message=SimpleNamespace(content='{"ok": true}'),
                raw={"usage": {"prompt_tokens": 12, "completion_tokens": 4}},
            )
        )
        return llm, model or "glm-4.7-flash"

    monkeypatch.setattr(llm_client, "create_llm", fake_create)
    monkeypatch.setattr(
        llm_client, "_attribute_to_current_user",
        lambda *_args, **_kwargs: None,
    )

    response = llm_client.generate_text(
        "hello",
        system="You are helpful.",
        provider="gemini",
        model="gemini-3.6-flash",
        task_type="chat_answer",
    )
    assert response.text == '{"ok": true}'
    assert response.usage.provider == "zai"
    assert response.usage.model == "glm-4.7-flash"
    assert captured["provider"] == "zai"
    assert captured["model"] == "glm-4.7-flash"


def test_zai_ingestion_uses_lite_model(monkeypatch):
    monkeypatch.setattr(llm_client, "primary_llm_provider", lambda: "zai")
    assert llm_client._model_for_task("ingestion_metadata") == "glm-4.5-flash"
    assert llm_client._model_for_task("chat_answer") == "glm-4.7-flash"


def test_zai_free_models_have_zero_cost():
    assert llm_client.estimate_cost_nanos("glm-4.7-flash", 1_000_000, 1_000_000) == 0
    assert llm_client.estimate_cost_nanos("glm-4.5-flash", 500_000, 250_000) == 0


def test_effective_providers_returns_zai_when_primary(monkeypatch):
    monkeypatch.setattr(llm_client, "primary_llm_provider", lambda: "zai")
    assert llm_client.effective_providers(["openai", "claude"]) == ["zai"]


def test_structured_reports_use_zai_when_primary(monkeypatch):
    monkeypatch.setattr(llm_client, "primary_llm_provider", lambda: "zai")
    captured = {}

    def fake_generate(prompt, **kwargs):
        captured.update(kwargs)
        return llm_client.LLMResponse(
            text='{"answer":"yes"}',
            usage=llm_client.LLMUsage(model="glm-4.7-flash", provider="zai"),
        )

    monkeypatch.setattr(llm_client, "generate_text", fake_generate)
    result = llm_client.generate_response_json(
        "prompt",
        system="system",
        schema={"type": "object", "properties": {"answer": {"type": "string"}}},
        schema_name="answer",
    )
    assert result.raw == {"answer": "yes"}
    assert captured["provider"] == "zai"
    assert captured["model"] == "glm-4.7-flash"
    assert "schema" in captured["system"].lower()
