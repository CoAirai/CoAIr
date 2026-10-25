import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from src.user_store import UserStore, UserQuotaExceededError, account_expired
from src import appliance_quota as quota


@pytest.fixture
def users(tmp_path, monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_DB_URL', raising=False)
    store = UserStore(tmp_path / 'users.db')
    store.create_user('pilot', 'temporary-password', storage_limit_bytes=5_000_000_000)
    store.update_user('pilot', access_plan='demo', must_change_password=True,
                      expires_at=(datetime.now(timezone.utc) + timedelta(days=7)).isoformat())
    return store


def test_expired_and_malformed_deadlines_fail_closed(users):
    assert not account_expired(users.get_user('pilot'))
    assert account_expired({'expires_at': 'invalid'})
    assert account_expired({'expires_at': '2020-01-01T00:00:00Z'})
    assert not account_expired({})


def test_first_password_change_and_old_session_revocation(users, monkeypatch):
    monkeypatch.setattr('src.org_store.get_org_store', lambda: SimpleNamespace(membership_for=lambda _: {'org_id': 'test-company'}))
    from backend.api.auth import router
    from backend.core import security
    monkeypatch.setattr(security, 'JWT_SECRET', 'test-secret-not-used-in-production')
    monkeypatch.setattr(security, '_enforce_session_timeout', lambda _: None)
    app = FastAPI()
    app.include_router(router, prefix='/api')
    app.dependency_overrides[security.get_user_store] = lambda: users
    @app.get('/api/protected')
    def protected(user=__import__('fastapi').Depends(security.get_current_user)):
        return {'username': user.username}
    client = TestClient(app)
    token = security.create_access_token('pilot', 'user')
    h = {'Authorization': 'Bearer ' + token}
    assert client.get('/api/protected', headers=h).json()['detail'] == 'password_change_required'
    assert client.post('/api/auth/change-password', headers=h, json={
        'current_password': 'wrong', 'new_password': 'new-long-password'}).status_code == 403
    changed = client.post('/api/auth/change-password', headers=h, json={
        'current_password': 'temporary-password', 'new_password': 'new-long-password'})
    assert changed.status_code == 200, changed.text
    assert not users.get_user('pilot')['must_change_password']
    assert client.get('/api/protected', headers=h).status_code == 401
    nh = {'Authorization': 'Bearer ' + changed.json()['access_token']}
    assert client.get('/api/protected', headers=nh).status_code == 200
    users.update_user('pilot', expires_at='2020-01-01T00:00:00Z')
    assert client.get('/api/protected', headers=nh).json()['detail'] == 'account_expired'


def test_concurrent_reservations_never_exceed_demo_limit(users):
    users.update_user('pilot', must_change_password=False)
    # Initialize schema before concurrent connections, like service startup.
    quota.snapshot(users, users.get_user('pilot'))
    def attempt(_):
        try:
            return quota.reserve(users, 'pilot', 600_000)
        except UserQuotaExceededError:
            return None
    with ThreadPoolExecutor(max_workers=8) as pool:
        ids = [x for x in pool.map(attempt, range(8)) if x]
    assert len(ids) == 1
    quota.settle(users, ids[0], 1234)
    quota.settle(users, ids[0], 1234)  # idempotent settlement
    assert quota.snapshot(users, users.get_user('pilot')) == {'used': 1234, 'reserved': 0, 'limit': 1_000_000}


def test_unknown_provider_usage_remains_reserved(users):
    users.update_user('pilot', must_change_password=False, access_plan='office')
    identifier = quota.reserve(users, 'pilot', 80_000)
    quota.settle(users, identifier, None)
    with pytest.raises(UserQuotaExceededError):
        quota.reserve(users, 'pilot', 30_000)
    assert quota.snapshot(users, users.get_user('pilot'))['reserved'] == 80_000


def test_oversized_upload_is_removed(tmp_path, monkeypatch):
    from backend.services.file_service import FileService
    monkeypatch.setenv('UPLOAD_MAX_BYTES', '10')
    monkeypatch.setattr(FileService, '_target_dir', staticmethod(lambda *a: tmp_path))
    class Upload:
        filename = 'example.pdf'
        async def read(self, size):
            return b'%PDF' + b'x' * 20
    with pytest.raises(HTTPException) as exc:
        asyncio.run(FileService().save(Upload(), 'project'))
    assert exc.value.status_code == 413
    assert not list(tmp_path.iterdir())


def test_chat_leases_enforce_global_and_per_user_limits(tmp_path, monkeypatch):
    from src.appliance_admission import ChatLease
    monkeypatch.setenv('COAIR_ADMISSION_DATABASE', str(tmp_path / 'leases.db'))
    a, duplicate, b, c, d = [ChatLease(x) for x in ['a', 'a', 'b', 'c', 'd']]
    assert a.try_acquire()
    assert not duplicate.try_acquire()
    assert b.try_acquire() and c.try_acquire()
    assert not d.try_acquire()
    a.release()
    assert duplicate.try_acquire()
    for item in [duplicate, b, c, d]:
        item.release()


def test_explicit_document_selection_does_not_union_filename_hints():
    from src.document_rag import DocumentRAG
    filters = DocumentRAG._build_metadata_filters(['chosen'], ['other.pdf'], project_id='project')
    def flatten(node):
        if hasattr(node, 'filters'):
            return [item for child in node.filters for item in flatten(child)]
        return [node]
    values = flatten(filters)
    # Filename hints intersect the selected IDs; they must never become an OR alternative.
    from llama_index.core.vector_stores.types import FilterCondition
    assert filters.condition == FilterCondition.AND
    assert any(getattr(child, 'key', '') == 'file_name' for child in filters.filters)
    selected = filters.filters[0]
    assert selected.condition == FilterCondition.OR
    assert not any(getattr(child, 'key', '') == 'file_name' for child in selected.filters)
    assert any(x.key == 'project_id' and x.value == 'project' for x in values)


@pytest.mark.parametrize('task,initial,retry,timeout', [
    ('chat_answer', 8192, 16384, 360),
    ('report_structured', 16384, 32768, 600),
])
def test_local_retry_widens_once_and_accounts_both_attempts(monkeypatch, task, initial, retry, timeout):
    from src import llm_client as client, config, openai_compatible
    monkeypatch.setattr(config, 'LOCAL_LLM', True)
    monkeypatch.setattr(config, 'LLM_LOCAL_OUTPUT_TOKENS', 32768)
    monkeypatch.setattr(config, 'LLM_CONTEXT_TOKENS', 131072)
    monkeypatch.setattr(client, 'LOCAL_LLM', True)
    monkeypatch.setattr(client, 'LLM_CONTEXT_TOKENS', 131072)
    monkeypatch.setattr(client, 'LLM_MODEL', 'qwen3.6-35b-a3b')
    for name in ['enforce_budget', '_enforce_user_quota']:
        monkeypatch.setattr(client, name, lambda: None)
    accounted, calls = [], []
    monkeypatch.setattr(client, '_attribute_to_current_user', lambda *args, **kwargs: accounted.append(args[:2]))
    monkeypatch.setattr(client, '_record_run_usage', lambda *args: None)
    monkeypatch.setattr(client, 'record_usage', lambda *args: None)
    def generate(**kwargs):
        calls.append(kwargs)
        finish, text = ('length', '') if len(calls) == 1 else ('stop', 'Completed answer')
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text), finish_reason=finish)],
                               usage=SimpleNamespace(prompt_tokens=100, completion_tokens=50))
    monkeypatch.setattr(openai_compatible, 'generate', generate)
    result = client.generate_text('question', task_type=task, ttl_s=0)
    assert result.text == 'Completed answer'
    assert [c['max_tokens'] for c in calls] == [initial, retry]
    assert all(c['timeout_seconds'] == timeout for c in calls)
    assert all(c['max_input_tokens'] + c['max_tokens'] + 1024 <= 131072 for c in calls)
    assert accounted == [(100, 50), (100, 50)]


def test_storage_cap_cannot_be_raised_or_softened_by_overage_policy(users, monkeypatch):
    from src.billing_store import StorageQuotaExceededError
    monkeypatch.setattr('src.overage.load_overage_policy', lambda: {'mode': 'bill', 'trigger_pct': 200})
    with pytest.raises(ValueError, match='appliance_storage_limit_exceeded'):
        users.billing.update_account('pilot', storage_limit_bytes=6_000_000_000)
    users.billing.register_storage(username='pilot', project_id='personal', file_id='a', file_path='a', size_bytes=5_000_000_000)
    with pytest.raises(StorageQuotaExceededError):
        users.billing.register_storage(username='pilot', project_id='personal', file_id='b', file_path='b', size_bytes=1)


def test_progress_identifier_cannot_disclose_or_overwrite_another_user():
    from backend.tasks.query_progress import QueryProgress
    progress = QueryProgress()
    progress.start('test-id', 'alice')
    with pytest.raises(ValueError):
        progress.start('test-id', 'bob', resume=True)
    with pytest.raises(ValueError):
        progress.start('test-id', 'alice')
    progress.add('test-id', 'thinking', 'queued')
    progress.start('test-id', 'alice', resume=True)
    assert progress.get('test-id').steps[0].label == 'queued'

@pytest.mark.parametrize('state,project', [
    ({'is_active':False}, {'role':'editor'}),
    ({'expires_at':'2020-01-01T00:00:00Z'}, {'role':'editor'}),
    ({'must_change_password':True}, {'role':'editor'}),
    ({}, {'role':'viewer'}),
    ({}, None),
    ({}, {'role':'editor','archived_at':'2026-10-02'}),
])
def test_queued_worker_rechecks_lifecycle_and_write_role(users,monkeypatch,state,project):
    from backend.core import security
    users.update_user('pilot',must_change_password=False,**state) if 'must_change_password' not in state else users.update_user('pilot',**state)
    monkeypatch.setattr(security,'get_user_store',lambda:users)
    monkeypatch.setattr('src.org_store.get_org_store',lambda:SimpleNamespace(membership_for=lambda _: {'org_id':'company'}))
    monkeypatch.setattr('src.project_store.get_project_store',lambda:SimpleNamespace(get_visible=lambda *a:project))
    with pytest.raises(PermissionError):security.authorize_worker('pilot','project')


def test_office_daily_period_and_demo_period_are_distinct(users,monkeypatch):
    users.update_user('pilot',must_change_password=False,access_plan='office')
    identifier=quota.reserve(users,'pilot',99999);quota.settle(users,identifier,99999)
    with pytest.raises(UserQuotaExceededError):quota.reserve(users,'pilot',2)
    from src.database import connect
    with connect(users.db_path) as conn:
        conn.execute("UPDATE appliance_token_usage SET period='yesterday' WHERE username='pilot'")
    assert quota.snapshot(users,users.get_user('pilot'))['used']==0
    users.update_user('pilot',access_plan='demo')
    assert quota.period_for(users.get_user('pilot'))=='demo'


def test_stale_cross_company_project_membership_does_not_authorize_appliance_user(users,monkeypatch):
    from backend.core import security,projects
    users.update_user('pilot',must_change_password=False)
    monkeypatch.setattr('src.user_store.get_user_store',lambda:users)
    monkeypatch.setattr('src.org_store.get_org_store',lambda:SimpleNamespace(membership_for=lambda _: {'org_id':'company-a'}))
    visible=SimpleNamespace(get_visible=lambda *a: {'org_id':'company-b','role':'editor'})
    identity=security.UserContext('pilot','user','Pilot',{},1000000)
    with pytest.raises(HTTPException) as exc:projects.get_current_project('foreign',identity,visible)
    assert exc.value.status_code==404
