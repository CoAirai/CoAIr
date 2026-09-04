"""Member token request create / transfer approve / deny."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ.setdefault("JWT_SECRET", "test-secret-please-replace-in-prod")


@pytest.fixture()
def stores(tmp_path, monkeypatch):
    from src import billing_store as billing_store_module
    from src import commerce_store as commerce_store_module
    from src import ops_store as ops_store_module
    from src import org_store as org_store_module
    from src import project_store as project_store_module
    from src import user_store as user_store_module

    users = user_store_module.UserStore(db_path=tmp_path / "users.db")
    projects = project_store_module.ProjectStore(db_path=tmp_path / "projects.db")
    orgs = org_store_module.OrgStore(db_path=tmp_path / "projects.db")
    commerce = commerce_store_module.CommerceStore(db_path=tmp_path / "commerce.db")
    ops = ops_store_module.OpsStore(db_path=tmp_path / "ops.db")
    monkeypatch.setattr(user_store_module.UserStore, "_instance", users)
    monkeypatch.setattr(project_store_module.ProjectStore, "_instance", projects)
    monkeypatch.setattr(org_store_module.OrgStore, "_instance", orgs)
    monkeypatch.setattr(commerce_store_module.CommerceStore, "_instance", commerce)
    monkeypatch.setattr(ops_store_module.OpsStore, "_instance", ops)
    monkeypatch.setattr(billing_store_module.BillingStore, "_instance", users.billing)
    return users, orgs, ops


@pytest.fixture()
def client(stores):
    from backend.api import auth as auth_router, org_ops
    from backend.core.security import get_current_user

    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api")
    app.include_router(
        org_ops.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    return TestClient(app)


def _auth(client, username, password="pw"):
    login = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    ).json()
    if login.get("mfa_required"):
        code = login.get("debug_code")
        assert code, "expected debug MFA code in tests"
        login = client.post(
            "/api/auth/mfa/verify",
            json={"mfa_token": login["mfa_token"], "code": code},
        ).json()
    return {"Authorization": f"Bearer {login['access_token']}"}


@pytest.fixture()
def pool_org(stores):
    users, orgs, _ops = stores
    users.create_user("pool-owner", "pw", role="user", token_limit=50)
    users.create_user("pool-member", "pw", role="user", token_limit=50)
    org = orgs.create_org(
        "Pool Co",
        created_by="platform",
        owner="pool-owner",
        default_token_limit=100,
    )
    orgs.add_member(org["org_id"], "pool-member", "member")
    return org


def test_member_creates_and_owner_transfers(client, stores, pool_org):
    users, _orgs, _ops = stores
    created = client.post(
        "/api/org/token-requests",
        headers=_auth(client, "pool-member"),
        json={"tokens": 10, "reason": "Need more for reports"},
    )
    assert created.status_code == 201, created.text
    req_id = created.json()["id"]

    listed = client.get(
        "/api/org/token-requests", headers=_auth(client, "pool-owner")
    )
    assert listed.status_code == 200
    assert any(r["id"] == req_id for r in listed.json()["requests"])

    approved = client.post(
        f"/api/org/token-requests/{req_id}/approve",
        headers=_auth(client, "pool-owner"),
        json={
            "mode": "transfer",
            "from_username": "pool-owner",
            "tokens": 10,
        },
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["transfer"]["tokens"] == 10
    assert int(users.get_user("pool-owner")["token_limit"]) == 40
    assert int(users.get_user("pool-member")["token_limit"]) == 60


def test_deny_token_request(client, pool_org):
    created = client.post(
        "/api/org/token-requests",
        headers=_auth(client, "pool-member"),
        json={"tokens": 5, "reason": "Please"},
    )
    req_id = created.json()["id"]
    denied = client.post(
        f"/api/org/token-requests/{req_id}/deny",
        headers=_auth(client, "pool-owner"),
    )
    assert denied.status_code == 200
    assert denied.json()["status"] == "denied"


def test_transfer_clamps_to_unused(client, stores, pool_org):
    users, _orgs, _ops = stores
    users.increment_usage("pool-owner", 45, 0)
    created = client.post(
        "/api/org/token-requests",
        headers=_auth(client, "pool-member"),
        json={"tokens": 100, "reason": "Lots"},
    )
    req_id = created.json()["id"]
    approved = client.post(
        f"/api/org/token-requests/{req_id}/approve",
        headers=_auth(client, "pool-owner"),
        json={
            "mode": "transfer",
            "from_username": "pool-owner",
            "tokens": 100,
        },
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["transfer"]["tokens"] == 5
