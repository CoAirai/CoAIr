"""OCR output limits must fail closed before partial text enters the index."""
from types import SimpleNamespace

import pytest

from src import llm_client


@pytest.mark.parametrize("reason,text,valid", [
    ("STOP", "source text", True),
    ("FinishReason.MAX_TOKENS", "cut off", False),
    ("SAFETY", "", False),
    ("STOP", "  ", False),
])
def test_multimodal_limits_and_metering(monkeypatch, reason, text, valid):
    from google import genai
    captured = {}
    response = SimpleNamespace(
        text=text, candidates=[SimpleNamespace(finish_reason=reason)],
        usage_metadata=SimpleNamespace(prompt_token_count=12,
            candidates_token_count=3, thoughts_token_count=2,
            cached_content_token_count=0),
    )
    def client(**kwargs):
        captured.update(kwargs)
        def generate(**kwargs):
            captured.update(kwargs)
            return response
        return SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    monkeypatch.setattr(genai, "Client", client)
    monkeypatch.setattr(llm_client, "_google_api_key", lambda: "offline-test")
    for name in ("enforce_budget", "_enforce_user_quota"):
        monkeypatch.setattr(llm_client, name, lambda: None)
    charged = []
    monkeypatch.setattr(llm_client, "record_usage", lambda *args: charged.append(args))
    monkeypatch.setattr(llm_client, "_attribute_to_current_user", lambda *a, **kw: None)
    monkeypatch.setattr(llm_client, "_record_run_usage", lambda *a: None)
    if valid:
        result = llm_client.generate_multimodal_text("read", b"image", max_tokens=999999)
        assert result.text == text and result.finish_reason == "STOP"
    else:
        with pytest.raises(llm_client.LLMIncompleteResponseError):
            llm_client.generate_multimodal_text("read", b"image", max_tokens=999999)
    assert captured["config"].max_output_tokens == 16384
    assert captured["http_options"].timeout == 180000
    assert len(charged) == 1
    assert charged[0][:2] == (12, 5)


@pytest.mark.parametrize("response,expected", [
    (SimpleNamespace(raw={"choices": [{"finish_reason": "length"}]}), "MAX_TOKENS"),
    (SimpleNamespace(raw={"candidates": [{"finishReason": "MAX_TOKENS"}]}), "MAX_TOKENS"),
    (SimpleNamespace(raw=SimpleNamespace(choices=[SimpleNamespace(finish_reason="stop")])), "STOP"),
    (SimpleNamespace(stop_reason="max_tokens"), "MAX_TOKENS"),
    (SimpleNamespace(stop_reason="end_turn"), "STOP"),
    (SimpleNamespace(raw={"choices": [{"finish_reason": "content_filter"}]}), "CONTENT_FILTER"),
])
def test_provider_stop_metadata_is_not_lost(response, expected):
    assert llm_client._response_finish_reason(response) == expected


def test_compatible_provider_truncation_is_charged_but_never_cached(monkeypatch):
    monkeypatch.setattr(llm_client, "primary_llm_provider", lambda: "zai")
    monkeypatch.setattr(llm_client, "_model_for_task", lambda *a: "glm-4.7-flash")
    monkeypatch.setattr(llm_client, "_cache_get", lambda *a: None)
    cached, charged = [], []
    monkeypatch.setattr(llm_client, "_cache_set", lambda *a: cached.append(a))
    for name in ("enforce_budget", "_enforce_user_quota"):
        monkeypatch.setattr(llm_client, name, lambda: None)
    monkeypatch.setattr(llm_client, "record_usage", lambda *a: charged.append(a))
    monkeypatch.setattr(llm_client, "_attribute_to_current_user", lambda *a, **kw: None)
    monkeypatch.setattr(llm_client, "_record_run_usage", lambda *a: None)
    response = SimpleNamespace(message=SimpleNamespace(content="incomplete text"),
                               raw={"choices": [{"finish_reason": "length"}]})
    monkeypatch.setattr(llm_client, "create_llm", lambda *a, **kw:
                        (SimpleNamespace(chat=lambda *a: response), "glm-4.7-flash"))
    with pytest.raises(llm_client.LLMIncompleteResponseError):
        llm_client.generate_text("answer", system="system", task_type="chat_answer")
    assert len(charged) == 1
    assert cached == []
