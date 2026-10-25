"""Exercise the real OpenAI HTTP transport, retry policy and atomic ledger."""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
import pytest
from src import appliance_quota as quota
from src.user_store import UserStore

@pytest.fixture
def local_transport(tmp_path, monkeypatch):
    from src import llm_client as client, config
    from backend.core import security
    store = UserStore(tmp_path / 'users.db')
    store.create_user('http-pilot', 'long-test-password')
    store.update_user('http-pilot', access_plan='demo', must_change_password=False)
    state = {'calls': [], 'responses': [], 'count': 100}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            status = 200
            if self.path == '/tokenize':
                data = {'count': state['count']}
            else:
                state['calls'].append(body)
                item = state['responses'].pop(0)
                time.sleep(item.get('delay', 0))
                status = item.get('status', 200)
                if status != 200:
                    data = {'error': {'message': 'explicit rejection', 'type': 'invalid_request_error'}}
                else:
                    data = {'id': 'chat-test', 'object': 'chat.completion', 'created': 1, 'model': 'qwen3.6-35b-a3b',
                            'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': item.get('text', 'answer')},
                                         'finish_reason': item.get('finish', 'stop')}],
                            'usage': {'prompt_tokens': 100, 'completion_tokens': item.get('output', 50),
                                      'total_tokens': 100 + item.get('output', 50)}}
            raw = json.dumps(data).encode()
            self.send_response(status); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(raw))); self.end_headers()
            try: self.wfile.write(raw)
            except BrokenPipeError: pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    for module in [client, config]:
        monkeypatch.setattr(module, 'LOCAL_LLM', True)
        monkeypatch.setattr(module, 'LLM_CONTEXT_TOKENS', 131072)
    monkeypatch.setattr(config, 'LLM_LOCAL_OUTPUT_TOKENS', 32768)
    monkeypatch.setattr(client, 'LLM_MODEL', 'qwen3.6-35b-a3b')
    monkeypatch.setattr(client, 'LLM_BASE_URL', f'http://127.0.0.1:{server.server_port}/v1')
    monkeypatch.setattr(client, 'LLM_API_KEY', 'fixture-key')
    import diskcache
    cache = diskcache.Cache(str(tmp_path / 'cache'))
    monkeypatch.setattr(client, '_cache', cache)
    monkeypatch.setattr(security, 'get_current_username', lambda: 'http-pilot')
    monkeypatch.setattr('src.user_store.get_user_store', lambda: store)
    for name in ['enforce_budget', '_enforce_user_quota']:
        monkeypatch.setattr(client, name, lambda: None)
    for name in ['_attribute_to_current_user', '_record_run_usage', 'record_usage']:
        monkeypatch.setattr(client, name, lambda *a, **k: None)
    yield client, state, store
    server.shutdown(); server.server_close(); thread.join()
    cache.close()

@pytest.mark.parametrize('task,initial,retry', [('chat_answer',8192,16384), ('report_structured',16384,32768)])
def test_http_truncation_retry_and_real_usage(local_transport, task, initial, retry):
    client, state, store = local_transport
    state['responses'] = [{'finish':'length','output':initial,'text':'cut'}, {'text':'completed','output':73}]
    assert client.generate_text('question',task_type=task,max_tokens=4096,ttl_s=60).text == 'completed'
    assert [c['max_tokens'] for c in state['calls']] == [initial,retry]
    assert quota.snapshot(store,store.get_user('http-pilot')) == {'used':200+initial+73,'reserved':0,'limit':1000000}
    assert len(client._cache) == 1

@pytest.mark.parametrize('response', [{'finish':'length','text':'cut'}, {'text':''}])
def test_http_incomplete_never_cached(local_transport, response):
    client,state,store = local_transport
    state['responses'] = [response.copy(),response.copy()]
    with pytest.raises(client.LLMIncompleteResponseError): client.generate_text('question',task_type='chat_answer',ttl_s=60)
    assert len(state['calls']) == 2
    assert not client._cache
    assert quota.snapshot(store,store.get_user('http-pilot'))['used'] == 300


def test_http_context_limit_does_not_generate(local_transport):
    from src.openai_compatible import ContextLimitError
    client,state,store = local_transport
    state['count'] = 131072
    with pytest.raises(ContextLimitError): client.generate_text('question',task_type='chat_answer')
    assert not state['calls'] and not client._cache


def test_http_explicit_rejection_releases_reservation(local_transport):
    from openai import AuthenticationError
    client,state,store = local_transport
    state['responses'] = [{'status':401}]
    with pytest.raises(AuthenticationError): client.generate_text('question',task_type='chat_answer')
    assert len(state['calls']) == 1
    assert quota.snapshot(store,store.get_user('http-pilot'))['reserved'] == 0


def test_http_timeout_keeps_unconfirmed_usage_reserved(local_transport):
    from openai import APITimeoutError
    from src.openai_compatible import generate
    client,state,store = local_transport
    state['responses'] = [{'delay':0.3}]
    with pytest.raises(APITimeoutError):
        generate(base_url=client.LLM_BASE_URL,api_key=client.LLM_API_KEY,model=client.LLM_MODEL,
                 prompt='question',system='',max_tokens=8192,max_input_tokens=113664,context_tokens=131072,
                 temperature=0,timeout_seconds=0.1)
    assert quota.snapshot(store,store.get_user('http-pilot'))['reserved'] == 8292
    assert not client._cache


def test_local_fallbacks_must_propagate_generation_errors(monkeypatch):
    from src.llm_errors import raise_local_generation_error
    from src.llm_client import LLMIncompleteResponseError
    monkeypatch.setattr('src.config.LOCAL_LLM',True)
    with pytest.raises(LLMIncompleteResponseError): raise_local_generation_error(LLMIncompleteResponseError('cut'))
    raise_local_generation_error(ValueError('non-generation auxiliary failure'))


def test_structured_local_retry_gets_constraints_without_increasing_retry_budget(local_transport):
    from pydantic import BaseModel, Field
    client, state, store = local_transport
    class Batch(BaseModel):
        values: list[str] = Field(max_length=1)
    state['responses'] = [{'text':'{"values":["a","b"]}'}, {'text':'{"values":["a"]}'}]
    response = client.generate_response_json('Source evidence', system='Use the supplied evidence',
        schema=Batch.model_json_schema(), schema_name='local-repair',validation_model=Batch,
        task_type='chronology_synthesis', ttl_s=0)
    assert response.raw == {'values':['a']}
    assert len(state['calls']) == 2
    assert 'maxItems' in state['calls'][1]['messages'][-1]['content']
    assert quota.snapshot(store,store.get_user('http-pilot'))['used'] == 300
