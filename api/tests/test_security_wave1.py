"""Wave 1 auth lifecycle: account_status, invite tokens, MFA lockout."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ.setdefault("JWT_SECRET", "test-secret-please-replace-in-prod")
os.environ.setdefault("COAIR_DEBUG_MFA", "1")


@pytest.fixture()
def stores(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("COAIR_DATABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    monkeypatch.delenv("SUPABASE_DB_PASSWORD", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    from src import database as database_module
    from src import ops_store as ops_store_module
    from src import org_store as org_store_module
    from src import project_store as project_store_module
    from src import user_store as user_store_module

    monkeypatch.setattr(database_module, "use_postgres", lambda: False)
    monkeypatch.setattr(database_module, "resolve_database_url", lambda: "")
    monkeypatch.setattr(user_store_module, "use_postgres", lambda: False)
    monkeypatch.setattr(ops_store_module, "use_postgres", lambda: False)
    monkeypatch.setattr(org_store_module, "use_postgres", lambda: False)
    monkeypatch.setattr(project_store_module, "use_postgres", lambda: False)
    users = user_store_module.UserStore(db_path=tmp_path / "users.db")
    projects = project_store_module.ProjectStore(db_path=tmp_path / "projects.db")
    orgs = org_store_module.OrgStore(db_path=tmp_path / "projects.db")
    ops = ops_store_module.OpsStore(db_path=tmp_path / "ops.db")
    monkeypatch.setattr(user_store_module.UserStore, "_instance", users)
    monkeypatch.setattr(project_store_module.ProjectStore, "_instance", projects)
    monkeypatch.setattr(org_store_module.OrgStore, "_instance", orgs)
    monkeypatch.setattr(ops_store_module.OpsStore, "_instance", ops)
    from src import billing_store as billing_store_module

    monkeypatch.setattr(billing_store_module.BillingStore, "_instance", users.billing)
    return users, orgs, ops


@pytest.fixture()
def client(stores):
    from backend.api import auth as auth_router
    from backend.core.security import get_current_user

    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api")

    @app.get("/api/me-test")
    def me_test(user=Depends(get_current_user)):
        return {"username": user.username}

    return TestClient(app)


def test_invited_user_cannot_login(client, stores):
    users, _orgs, _ops = stores
    from src.user_store import ACCOUNT_INVITED

    users.create_user(
        "invitee@example.com",
        "password123",
        is_active=False,
        account_status=ACCOUNT_INVITED,
    )
    resp = client.post(
        "/api/auth/login",
        json={"username": "invitee@example.com", "password": "password123"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "invite_not_activated"


def test_suspended_user_cannot_use_api(client, stores):
    users, _orgs, _ops = stores
    from backend.core.security import create_access_token
    from src.user_store import ACCOUNT_SUSPENDED

    users.create_user("active@example.com", "password123")
    users.update_user("active@example.com", account_status=ACCOUNT_SUSPENDED)
    token = create_access_token("active@example.com", "user")
    resp = client.get("/api/me-test", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert resp.json()["detail"] == "account_suspended"


def test_invite_activate_requires_token_otp_password(client, stores):
    users, orgs, ops = stores
    from src.auth_provision import issue_invite_activation_email
    from src.user_store import ACCOUNT_ACTIVE, ACCOUNT_INVITED

    users.create_user(
        "owner@acme.test",
        "password123",
        is_active=False,
        account_status=ACCOUNT_INVITED,
    )
    org = orgs.create_org("Acme", created_by="platform", owner="owner@acme.test")
    activation = issue_invite_activation_email(
        email="owner@acme.test",
        display_name="Owner",
        company_name="Acme",
        email_kind="owner_invite",
        org_id=org["org_id"],
    )
    assert activation.get("debug_invite_token")
    assert activation.get("debug_code")

    missing_token = client.post(
        "/api/auth/invite/activate",
        json={
            "email": "owner@acme.test",
            "password": "newpass123",
            "code": activation["debug_code"],
            "token": "",
        },
    )
    assert missing_token.status_code == 422

    bad_token = client.post(
        "/api/auth/invite/activate",
        json={
            "email": "owner@acme.test",
            "password": "newpass123",
            "code": activation["debug_code"],
            "token": "not-a-real-token-value-xxxxxxxxxx",
        },
    )
    assert bad_token.status_code == 400
    assert bad_token.json()["detail"] == "invalid_invite_token"

    ok = client.post(
        "/api/auth/invite/activate",
        json={
            "email": "owner@acme.test",
            "password": "newpass123",
            "code": activation["debug_code"],
            "token": activation["debug_invite_token"],
        },
    )
    assert ok.status_code == 200
    record = users.get_user("owner@acme.test")
    assert record["account_status"] == ACCOUNT_ACTIVE
    assert record["is_active"] is True

    reuse = client.post(
        "/api/auth/invite/activate",
        json={
            "email": "owner@acme.test",
            "password": "anotherpass",
            "code": activation["debug_code"],
            "token": activation["debug_invite_token"],
        },
    )
    assert reuse.status_code == 409


def test_mfa_burns_after_five_failures(client, stores):
    users, _orgs, ops = stores
    users.create_user("mfa@example.com", "password123")
    login = client.post(
        "/api/auth/login",
        json={"username": "mfa@example.com", "password": "password123"},
    ).json()
    mfa_token = login["mfa_token"]
    for _ in range(5):
        resp = client.post(
            "/api/auth/mfa/verify",
            json={"mfa_token": mfa_token, "code": "000000"},
        )
        assert resp.status_code == 401
    final = client.post(
        "/api/auth/mfa/verify",
        json={"mfa_token": mfa_token, "code": login["debug_code"]},
    )
    assert final.status_code == 401
    assert final.json()["detail"] in ("otp_attempts_exceeded", "invalid_mfa_token")
