"""Wave 2 tenant isolation / IDOR pack."""

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
    from src import commerce_store as commerce_store_module
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
    monkeypatch.setattr(commerce_store_module, "use_postgres", lambda: False)
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
    from src import billing_store as billing_store_module

    monkeypatch.setattr(billing_store_module.BillingStore, "_instance", users.billing)
    return users, projects, orgs, ops


@pytest.fixture()
def client(stores):
    from backend.api import auth as auth_router
    from backend.api import org_admin, org_ops, projects
    from backend.core.security import get_current_user

    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api")
    app.include_router(
        org_admin.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        org_ops.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        projects.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    return TestClient(app)


def _auth(client, username, password="pw"):
    login = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    ).json()
    if login.get("mfa_required"):
        code = login.get("debug_code")
        assert code
        login = client.post(
            "/api/auth/mfa/verify",
            json={"mfa_token": login["mfa_token"], "code": code},
        ).json()
    return {"Authorization": f"Bearer {login['access_token']}"}


@pytest.fixture()
def tenants(stores):
    users, projects, orgs, _ops = stores
    users.create_user("acme-owner", "pw", role="user")
    users.create_user("acme-member", "pw", role="user")
    users.create_user("rival-owner", "pw", role="user")
    users.create_user("rival-member", "pw", role="user")
    acme = orgs.create_org(
        "Acme", created_by="platform", owner="acme-owner", default_credits=100
    )
    rival = orgs.create_org("Rival", created_by="platform", owner="rival-owner")
    orgs.add_member(acme["org_id"], "acme-member", "member")
    orgs.add_member(rival["org_id"], "rival-member", "member")
    acme_project = projects.create_project(
        "Acme Tower", "acme-owner", org_id=acme["org_id"]
    )
    rival_project = projects.create_project(
        "Rival Tower", "rival-owner", org_id=rival["org_id"]
    )
    return {
        "acme": acme,
        "rival": rival,
        "acme_project": acme_project,
        "rival_project": rival_project,
    }


def test_cross_tenant_org_users_denied(client, tenants):
    headers = _auth(client, "acme-owner")
    # Acme owner sees only Acme members via /org/users
    body = client.get("/api/org/users", headers=headers).json()
    names = {u["username"] for u in body.get("users", body if isinstance(body, list) else [])}
    if not names and isinstance(body, dict):
        names = {u["username"] for u in body.get("members", [])}
    assert "rival-owner" not in names
    assert "rival-member" not in names


def test_cross_tenant_project_access_denied(client, tenants):
    headers = _auth(client, "acme-owner")
    rival_id = tenants["rival_project"]["project_id"]
    listed = client.get("/api/projects", headers=headers).json()
    ids = {p["project_id"] for p in listed.get("projects", [])}
    assert rival_id not in ids
    members = client.get(f"/api/org/projects/{rival_id}/members", headers=headers)
    assert members.status_code in (403, 404)


def test_member_cannot_invite(client, tenants):
    headers = _auth(client, "acme-member")
    resp = client.post(
        "/api/org/invites",
        headers=headers,
        json={"email": "newbie@acme.test", "display_name": "Newbie"},
    )
    assert resp.status_code == 403


def test_x_org_id_ignored_for_members(client, tenants):
    headers = {
        **_auth(client, "acme-member"),
        "X-Org-ID": tenants["rival"]["org_id"],
    }
    body = client.get("/api/org", headers=headers).json()
    assert body["org"]["name"] == "Acme"
    assert body["org"]["org_id"] == tenants["acme"]["org_id"]


def test_invited_jwt_cannot_call_apis(client, stores, tenants):
    users, _projects, _orgs, _ops = stores
    from backend.core.security import create_access_token
    from src.user_store import ACCOUNT_INVITED

    users.create_user(
        "pending@acme.test",
        "pw",
        is_active=False,
        account_status=ACCOUNT_INVITED,
    )
    token = create_access_token("pending@acme.test", "user")
    resp = client.get(
        "/api/org",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "invite_not_activated"


def test_vector_project_scope_still_required():
    pytest.importorskip("fitz")
    from src.document_rag import ProjectScopeRequired, _require_project_id
    from src.project_context import set_current_project

    set_current_project("")
    with pytest.raises(ProjectScopeRequired):
        _require_project_id("")
