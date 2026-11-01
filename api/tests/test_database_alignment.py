"""Run unchanged on isolated SQLite and disposable PostgreSQL; no live DB import."""
from concurrent.futures import ThreadPoolExecutor
import uuid

import pytest

from src.database import apply_core_schema
from src.user_store import UserStore
from src.project_store import ProjectStore
from src.org_store import OrgStore


@pytest.fixture
def stores(tmp_path):
    apply_core_schema()
    users = UserStore(tmp_path / 'users.db')
    projects = ProjectStore(tmp_path / 'projects.db')
    orgs = OrgStore(tmp_path / 'projects.db')
    owner, other = ('owner-' + uuid.uuid4().hex[:12], 'other-' + uuid.uuid4().hex[:12])
    users.create_user(owner, 'qualification-only', token_limit=1000000)
    users.create_user(other, 'qualification-only', token_limit=1000000)
    return users, projects, orgs, owner, other


def test_schema_reapplication_preserves_users_and_ownership(stores):
    users, projects, orgs, owner, other = stores
    org = orgs.create_org('Qualification', created_by=owner, owner=owner)
    project = projects.create_project('Qualification', owner)
    apply_core_schema(force=True)
    assert users.get_user(owner)['username'] == owner
    assert projects.get_for_user(project['project_id'], other) is None
    assert projects.get_for_user(project['project_id'], owner)['role'] == 'owner'
    assert orgs.list_members(org['org_id'])[0]['username'] == owner
    reopened = ProjectStore(projects.db_path)
    assert reopened.get_for_user(project['project_id'], owner) is not None


def test_concurrent_ca_updates_and_ledger_idempotency(stores):
    users, _, _, owner, other = stores
    def charge(index):
        users.increment_usage(owner, 7, 3)
        # All retries use one provider-call key: only one ledger row may exist.
        users.billing.record_charge(username=owner, project_id='isolated-project', run_id='isolated-run',
            provider='gemini', model='qualification', prompt_tokens=7, completion_tokens=3,
            provider_cost_nanos=1000000, idempotency_key=owner + '-provider-call')
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(charge, range(24)))
    assert users.get_usage(owner)['used_tokens'] == 240
    assert users.get_usage(owner)['total_calls'] == 24
    assert users.get_usage(other)['used_tokens'] == 0
    with users._connect() as db:
        row = db.execute('SELECT COUNT(*),SUM(provider_cost_nanos) FROM billing_ledger WHERE username=? AND event_type=?', [owner, 'charge']).fetchone()
    assert (row[0], row[1]) == (1, 1000000)


def test_failed_transaction_does_not_persist_partial_usage(stores):
    users, _, _, owner, _ = stores
    with pytest.raises(RuntimeError):
        with users._connect() as db:
            db.execute('UPDATE user_usage SET prompt_tokens=999 WHERE username=?', [owner])
            raise RuntimeError('qualification rollback')
    assert users.get_usage(owner)['used_tokens'] == 0


def test_provider_key_registry_remains_backend_only():
    from src.database import connect, use_postgres
    if not use_postgres():
        pytest.skip('PostgreSQL RLS contract')
    apply_core_schema(force=True)
    with connect() as db:
        assert db.execute("SELECT relrowsecurity FROM pg_class WHERE oid='public.provider_key_registry'::regclass").fetchone()[0]
        for role, expected in (('anon', False), ('authenticated', False), ('service_role', True)):
            exists = db.execute('SELECT 1 FROM pg_roles WHERE rolname=?', [role]).fetchone()
            if exists:
                allowed = db.execute("SELECT has_table_privilege(?, 'public.provider_key_registry', 'SELECT')", [role]).fetchone()[0]
                assert allowed == expected
