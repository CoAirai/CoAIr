"""Public demo signup contract with real stores and simulated email transport."""
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def demo(tmp_path, monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_DB_URL', raising=False)
    monkeypatch.setenv('COAIR_DEMO_INVITES_ENABLED', '1')
    monkeypatch.setenv('COAIR_USER_URL', 'https://demo.example.com')
    monkeypatch.setenv('RESEND_API_KEY', 'test-not-a-real-key')
    monkeypatch.setenv('COAIR_ENV', 'production')
    monkeypatch.setenv('COAIR_DEBUG_MFA', '0')
    from src.user_store import UserStore, get_user_store
    from src.org_store import OrgStore, get_org_store
    from src.project_store import ProjectStore
    from src.ops_store import OpsStore, get_ops_store
    from backend.core.security import UserContext, get_current_user
    from backend.api import auth, org_ops
    from backend.core.platform_guard import _rate_limiter
    _rate_limiter._hits.clear()
    users = UserStore(tmp_path/'users.db')
    orgs = OrgStore(tmp_path/'projects.db')
    projects = ProjectStore(tmp_path/'projects.db')
    ops = OpsStore(tmp_path/'ops.db')
    for cls, obj in [(UserStore, users), (OrgStore, orgs), (ProjectStore, projects), (OpsStore, ops)]:
        monkeypatch.setattr(cls, '_instance', obj)
    monkeypatch.setattr(org_ops, 'use_supabase_auth', lambda: False)
    monkeypatch.setattr(auth, 'use_supabase_auth', lambda: False)
    users.create_user('owner@example.com', 'owner-password')
    company = orgs.create_org('Demo', created_by='operator', owner='owner@example.com')
    users.create_user('member@example.com', 'member-password')
    orgs.add_member(company['org_id'], 'member@example.com', 'member')
    caller = {'username': 'owner@example.com'}
    mail = []
    def send(kind, email, **kwargs):
        mail.append(dict(kind=kind, email=email, **kwargs))
        return {'ok': True, 'mode': 'live'}
    monkeypatch.setattr('src.auth_provision.send_coair_email', send)
    monkeypatch.setattr('src.email_delivery.send_coair_email', send)
    app = FastAPI()
    app.include_router(auth.router, prefix='/api')
    app.include_router(org_ops.router, prefix='/api')
    app.dependency_overrides[get_user_store] = lambda: users
    app.dependency_overrides[get_org_store] = lambda: orgs
    app.dependency_overrides[get_ops_store] = lambda: ops
    app.dependency_overrides[get_current_user] = lambda: UserContext(username=caller['username'], role='user', display_name=caller['username'], features={}, token_limit=1_000_000)
    return TestClient(app), users, orgs, ops, mail, caller


def invite(demo, email='customer@example.com'):
    response = demo[0].post('/api/org/invites', json={'email': email})
    assert response.status_code == 201, response.text
    body = response.json()
    return body, parse_qs(urlsplit(body['invite_url']).query)['token'][0]


def test_invite_activation_provisions_private_demo_and_starts_clock(demo):
    client, users, orgs, ops, mail, caller = demo
    body, token = invite(demo)
    assert body['email_sent'] and not body['temporary_password'] and body['invite_expires_at']
    assert not body.get('debug_code')
    pending = users.get_user('customer@example.com')
    assert not pending['is_active'] and pending['expires_at'] is None
    assert not pending.get('personal_project_id')
    preview = client.get('/api/auth/invite/preview', params={'token': token})
    assert preview.status_code == 200
    response = client.post('/api/auth/invite/activate', json={
        'token': token, 'password': 'my-own-secure-password', 'code': mail[-1]['mfa_code']})
    assert response.status_code == 200, response.text
    record = users.verify_password('customer@example.com', 'my-own-secure-password')
    assert record['is_active'] and record['personal_project_id'] and not record['must_change_password']
    assert 6.99 < (datetime.fromisoformat(record['expires_at'])-datetime.now(timezone.utc)).total_seconds()/86400 < 7.01
    assert record['token_limit'] == 1_000_000
    assert users.get_billing_summary(record['username'])['storage_limit_bytes'] == 5_000_000_000
    from src.project_store import get_project_store
    project = get_project_store().get_for_user(record['personal_project_id'], record['username'])
    assert project['created_by'] == record['username']
    assert project['role'] == 'owner'
    assert get_project_store().get_for_user(record['personal_project_id'], 'member@example.com') is None
    assert project['org_id'] == orgs.membership_for(record['username'])['org_id']
    assert client.post('/api/auth/invite/activate', json={'token': token, 'password': 'replacement-password', 'code': mail[-1]['mfa_code']}).status_code == 400


def test_invalid_otp_short_password_and_foreign_email_do_not_activate(demo):
    client, users, _, _, mail, _ = demo
    _, token = invite(demo)
    for fields in [{'code': 'not-real'}, {'password': 'short'}, {'email': 'other@example.com'}]:
        response = client.post('/api/auth/invite/activate', json={
            'token': token, 'password': 'secure-long-password', 'code': mail[-1]['mfa_code'], **fields})
        assert response.status_code in (400, 422)
        assert not users.get_user('customer@example.com')['is_active']


def test_configuration_failures_never_create_account(demo, monkeypatch):
    client, users, *_ = demo
    monkeypatch.delenv('RESEND_API_KEY')
    assert client.post('/api/org/invites', json={'email': 'new@example.com'}).status_code == 503
    assert users.get_user('new@example.com') is None
    monkeypatch.setenv('RESEND_API_KEY', 'test')
    monkeypatch.setenv('COAIR_USER_URL', 'http://localhost:18081')
    assert client.post('/api/org/invites', json={'email': 'new@example.com'}).status_code == 503


def test_member_cannot_invite_and_other_company_identity_is_rejected(demo):
    client, users, orgs, _, _, caller = demo
    caller['username'] = 'member@example.com'
    assert client.post('/api/org/invites', json={'email': 'new@example.com'}).status_code == 403
    caller['username'] = 'owner@example.com'
    users.create_user('foreign@example.com', 'foreign-password')
    orgs.create_org('Other company', created_by='operator', owner='foreign@example.com')
    assert client.post('/api/org/invites', json={'email': 'foreign@example.com'}).status_code == 409


def test_reissue_revokes_old_link_and_disabled_user_cannot_rejoin(demo):
    client, users, _, _, mail, _ = demo
    _, old = invite(demo)
    _, new = invite(demo)
    assert old != new
    assert client.get('/api/auth/invite/preview', params={'token': old}).status_code == 400
    assert client.get('/api/auth/invite/preview', params={'token': new}).status_code == 200
    users.update_user('customer@example.com', is_active=False)
    assert client.post('/api/org/invites', json={'email': 'customer@example.com'}).status_code == 409
    assert client.post('/api/auth/invite/activate', json={'token': new, 'password': 'secure-long-password', 'code': mail[-1]['mfa_code']}).status_code == 403


def test_capacity_and_mail_failure_are_visible_without_password(demo, monkeypatch):
    client, users, *_ = demo
    monkeypatch.setenv('COAIR_DEMO_MAX_ACCOUNTS', '2')
    assert client.post('/api/org/invites', json={'email': 'new@example.com'}).status_code == 409
    monkeypatch.setenv('COAIR_DEMO_MAX_ACCOUNTS', '10')
    monkeypatch.setattr('src.auth_provision.send_coair_email', lambda *a, **k: {'ok': False, 'mode': 'live', 'error': 'provider_unavailable'})
    body, _ = invite(demo)
    assert not body['email_sent'] and body['email_error'] and not body['temporary_password']
    assert not users.get_user('customer@example.com')['is_active']
