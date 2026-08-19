"""
Role tiers: `admin` keeps every power it had, and only `superadmin` may manage
operator accounts (create / promote / demote / disable / delete an admin).

These tests drive the real /api/admin/users router so the guards are exercised
through FastAPI's dependency graph, not called directly.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ.setdefault("JWT_SECRET", "test-secret-please-replace-in-prod")


@pytest.fixture()
def store(tmp_path, monkeypatch):
    from src import ops_store as ops_store_module
    from src import org_store as org_store_module
    from src import project_store as project_store_module
    from src import user_store as user_store_module

    instance = user_store_module.UserStore(db_path=tmp_path / "users.db")
    projects = project_store_module.ProjectStore(db_path=tmp_path / "projects.db")
    orgs = org_store_module.OrgStore(db_path=tmp_path / "projects.db")
    ops = ops_store_module.OpsStore(db_path=tmp_path / "ops.db")
    monkeypatch.setattr(user_store_module.UserStore, "_instance", instance)
    monkeypatch.setattr(project_store_module.ProjectStore, "_instance", projects)
    monkeypatch.setattr(org_store_module.OrgStore, "_instance", orgs)
    monkeypatch.setattr(ops_store_module.OpsStore, "_instance", ops)
    return instance


@pytest.fixture()
def client(store):
    from backend.api import admin_users, auth as auth_router
    from backend.core.security import require_admin
    from fastapi import Depends

    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api")
    app.include_router(
        admin_users.router, prefix="/api", dependencies=[Depends(require_admin)],
    )
    return TestClient(app)


def _auth(client: TestClient, username: str, password: str = "pw") -> dict:
    token = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _new_user_payload(username: str, role: str = "user") -> dict:
    return {"username": username, "password": "pw123456", "role": role}


# ── The admin tier keeps working exactly as before ──────────


def test_admin_still_passes_the_admin_gate(client, store):
    store.create_user("plain", "pw", role="user")
    store.create_user("ops", "pw", role="admin")

    assert client.get("/api/admin/users", headers=_auth(client, "plain")).status_code == 403
    assert client.get("/api/admin/users", headers=_auth(client, "ops")).status_code == 200


def test_superadmin_passes_the_admin_gate(client, store):
    store.create_user("owner", "pw", role="superadmin")
    assert client.get("/api/admin/users", headers=_auth(client, "owner")).status_code == 200


def test_admin_can_still_manage_ordinary_users(client, store):
    store.create_user("ops", "pw", role="admin")
    headers = _auth(client, "ops")

    created = client.post("/api/admin/users", json=_new_user_payload("acme"), headers=headers)
    assert created.status_code == 201
    patched = client.patch(
        "/api/admin/users/acme", json={"display_name": "Acme Ltd"}, headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["display_name"] == "Acme Ltd"
    assert client.delete("/api/admin/users/acme", headers=headers).status_code == 204


# ── Operator accounts are superadmin-only ───────────────────


def test_admin_cannot_create_an_operator(client, store):
    store.create_user("ops", "pw", role="admin")
    headers = _auth(client, "ops")

    for role in ("admin", "superadmin"):
        resp = client.post("/api/admin/users", json=_new_user_payload(f"peer-{role}", role), headers=headers)
        assert resp.status_code == 403
        assert resp.json()["detail"].startswith("superadmin_required")
    assert store.get_user("peer-admin") is None


def test_admin_cannot_promote_demote_or_delete_a_peer(client, store):
    store.create_user("ops", "pw", role="admin")
    store.create_user("peer", "pw", role="admin")
    store.create_user("acme", "pw", role="user")
    headers = _auth(client, "ops")

    assert client.patch("/api/admin/users/peer", json={"is_active": False}, headers=headers).status_code == 403
    assert client.delete("/api/admin/users/peer", headers=headers).status_code == 403
    assert client.patch("/api/admin/users/acme", json={"role": "admin"}, headers=headers).status_code == 403
    assert store.get_user("acme")["role"] == "user"


def test_admin_cannot_promote_itself(client, store):
    store.create_user("ops", "pw", role="admin")
    resp = client.patch(
        "/api/admin/users/ops", json={"role": "superadmin"}, headers=_auth(client, "ops"),
    )
    assert resp.status_code == 403
    assert store.get_user("ops")["role"] == "admin"


def test_superadmin_can_create_and_promote_operators(client, store):
    store.create_user("owner", "pw", role="superadmin")
    headers = _auth(client, "owner")

    assert client.post("/api/admin/users", json=_new_user_payload("ops2", "admin"), headers=headers).status_code == 201
    # Operator accounts are unmetered: no demo plan, no credits.
    assert store.billing.get_account("ops2")["plan_type"] == "legacy"

    store.create_user("acme", "pw", role="user")
    assert client.patch("/api/admin/users/acme", json={"role": "admin"}, headers=headers).status_code == 200
    assert store.get_user("acme")["role"] == "admin"


# ── Lockout guards ──────────────────────────────────────────


def test_last_superadmin_cannot_be_removed(client, store):
    store.create_user("owner", "pw", role="superadmin")
    store.create_user("second", "pw", role="superadmin")
    headers = _auth(client, "owner")

    # Two superadmins: demoting one is fine.
    assert client.patch("/api/admin/users/second", json={"role": "admin"}, headers=headers).status_code == 200
    # Now `owner` is the last one — it cannot disable, demote or delete itself.
    assert client.patch("/api/admin/users/owner", json={"is_active": False}, headers=headers).status_code == 409
    assert client.delete("/api/admin/users/owner", headers=headers).status_code == 403  # self-delete
    assert store.get_user("owner")["is_active"] is True


def test_invalid_role_is_rejected_on_update(client, store):
    store.create_user("owner", "pw", role="superadmin")
    store.create_user("acme", "pw", role="user")
    resp = client.patch(
        "/api/admin/users/acme", json={"role": "root"}, headers=_auth(client, "owner"),
    )
    assert resp.status_code == 400
    assert store.get_user("acme")["role"] == "user"
