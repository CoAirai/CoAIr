from types import SimpleNamespace
import pytest
from src import llm_client as client
from src import openai_compatible as transport


def test_endpoint_rejects_credentials_and_non_api_paths():
    for endpoint in ('https://user:secret@host/v1', 'file:///v1', 'http://host/v1?q=1', 'http://host/'):
        with pytest.raises(ValueError):
            transport.validate_endpoint(endpoint, 'secret')


def test_visible_text_does_not_expose_reasoning():
    assert transport.visible_text('<think>private</think>answer') == 'answer'
    assert transport.visible_text('<think>unfinished') == ''


@pytest.fixture
def local(monkeypatch):
    monkeypatch.setattr(client, 'LOCAL_LLM', True)
    monkeypatch.setattr(client, 'LLM_MODEL', 'qwen3-8b')
    monkeypatch.setattr(client, 'enforce_budget', lambda: None)
    monkeypatch.setattr(client, '_enforce_user_quota', lambda: None)
    monkeypatch.setattr(client, '_attribute_to_current_user', lambda *a, **k: None)
    monkeypatch.setattr(client, '_record_run_usage', lambda *a: None)
    monkeypatch.setattr(client, 'record_usage', lambda *a: None)
    monkeypatch.setattr(client, 'create_llm', lambda *a, **k: pytest.fail('cloud factory invoked'))
    monkeypatch.setattr(client, '_gemini_generate_native', lambda **k: pytest.fail('cloud invoked'))


def test_agent_boundary_routes_explicit_cloud_requests_locally(local, monkeypatch):
    captured = {}
    def generate(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='Local answer'),
                                                        finish_reason='stop')],
                               usage=SimpleNamespace(prompt_tokens=10, completion_tokens=2))
    monkeypatch.setattr(transport, 'generate', generate)
    result = client.generate_text('Question', provider='gemini', model='gemini-3.6-flash', ttl_s=0)
    assert captured['model'] == 'qwen3-8b'
    assert result.text == 'Local answer'
    assert result.usage.provider == 'vllm'
    assert result.usage.cost_estimate == 0
    assert result.usage.prompt_tokens == 10


def test_truncated_local_response_is_not_accepted(local, monkeypatch):
    monkeypatch.setattr(transport, 'generate', lambda **k: SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content='partial'), finish_reason='length')],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=2)))
    with pytest.raises(client.LLMIncompleteResponseError):
        client.generate_text('Question', ttl_s=0)


def test_local_multimodal_never_calls_google(local):
    with pytest.raises(RuntimeError, match='local OCR'):
        client.generate_multimodal_text('Read', b'image')


def test_profiles_fit_local_context(monkeypatch):
    from src import config, model_profiles
    monkeypatch.setattr(config, 'LOCAL_LLM', True)
    for task in model_profiles.TASK_PROFILES:
        profile = model_profiles.get_task_profile(task)
        assert profile.max_input_tokens + profile.max_output_tokens < config.LLM_CONTEXT_TOKENS


def test_local_mode_accepts_only_appliance_embedding_service(monkeypatch):
    from src import config
    monkeypatch.setattr(config, 'LOCAL_LLM', True)
    monkeypatch.setattr(config, 'LLM_BASE_URL', 'http://model-proxy:8081/v1')
    monkeypatch.setattr(config, 'LLM_API_KEY', 'local-key')
    monkeypatch.setattr(config, 'VECTOR_STORE_BACKEND', 'qdrant')
    monkeypatch.setattr(config, 'EMBEDDING_PROVIDER', 'api')
    monkeypatch.setattr(config, 'EMBEDDING_API_KEY', 'a' * 32)
    monkeypatch.setattr(config, 'EMBEDDING_API_URL', 'http://embedding:8082/v1/embeddings')
    assert 'Local deployment requires local embeddings' not in config.validate_config()[1]
    monkeypatch.setattr(config, 'EMBEDDING_API_URL', 'https://external.example/v1/embeddings')
    assert 'Local deployment requires local embeddings' in config.validate_config()[1]
