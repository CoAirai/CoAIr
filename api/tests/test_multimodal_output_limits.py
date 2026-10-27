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
