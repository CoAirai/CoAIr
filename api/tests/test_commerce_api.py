"""Tickets, packages, sell rate, and access-request checkout through the routers."""

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
    from src import billing_store as billing_store_module
    monkeypatch.setattr(billing_store_module.BillingStore, "_instance", users.billing)
    return users, projects, orgs, commerce


@pytest.fixture()
def client(stores):
    from backend.api import (
        access_requests,
        admin_commerce,
        auth as auth_router,
        commerce,
        org_admin,
        tickets,
    )
    from backend.core.security import get_current_user, require_admin

    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api")
    app.include_router(access_requests.router, prefix="/api")
    app.include_router(
        org_admin.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        tickets.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        commerce.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        admin_commerce.router, prefix="/api", dependencies=[Depends(require_admin)]
    )
    return TestClient(app)


def _auth(client, username, password="pw"):
    token = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def acme(stores):
    users, projects, orgs, _commerce = stores
    users.create_user("acme-admin", "pw", role="user")
    users.create_user("engineer", "pw", role="user")
    users.create_user("ops", "pw", role="admin")
    org = orgs.create_org(
        "Acme", created_by="platform", owner="acme-admin",
        default_credits=250, default_token_limit=500_000,
    )
    orgs.add_member(org["org_id"], "engineer", "member")
    project = projects.create_project("Tower", "acme-admin", org_id=org["org_id"])
    return {"org": org, "project": project}


@pytest.fixture()
def rival(stores):
    users, projects, orgs, _commerce = stores
    users.create_user("rival-admin", "pw", role="user")
    org = orgs.create_org("Rival", created_by="platform", owner="rival-admin")
    projects.create_project("Rival Tower", "rival-admin", org_id=org["org_id"])
    return {"org": org}


def test_owner_creates_and_lists_own_tickets(client, acme):
    headers = _auth(client, "acme-admin")
    created = client.post("/api/tickets", headers=headers, json={
        "subject": "Library upload stuck",
        "priority": "high",
        "message": "XER files never leave queued.",
    })
    assert created.status_code == 201
    ticket = created.json()
    assert ticket["subject"] == "Library upload stuck"
    assert ticket["priority"] == "high"
    assert ticket["status"] == "open"
    assert ticket["company_id"] == acme["org"]["org_id"]
    assert ticket["message"] == "XER files never leave queued."
    assert len(ticket["created_at"]) == 10

    listed = client.get("/api/tickets", headers=headers).json()
    assert [row["id"] for row in listed["tickets"]] == [ticket["id"]]


def test_member_cannot_open_a_ticket(client, acme):
    resp = client.post("/api/tickets", headers=_auth(client, "engineer"), json={
        "subject": "Help", "priority": "low", "message": "Please",
    })
    assert resp.status_code == 403


def test_owner_cannot_see_another_company_ticket(client, acme, rival):
    created = client.post("/api/tickets", headers=_auth(client, "acme-admin"), json={
        "subject": "Acme only", "priority": "medium", "message": "Internal",
    }).json()
    listed = client.get("/api/tickets", headers=_auth(client, "rival-admin")).json()
    assert created["id"] not in [row["id"] for row in listed["tickets"]]


def test_platform_admin_assigns_and_resolves_tickets(client, acme):
    created = client.post("/api/tickets", headers=_auth(client, "acme-admin"), json={
        "subject": "Need credits", "priority": "medium", "message": "Top up",
    }).json()
    ops = _auth(client, "ops")
    listed = client.get("/api/admin/tickets", headers=ops)
    assert listed.status_code == 200
    assert listed.json()["tickets"][0]["id"] == created["id"]

    patched = client.patch(
        f"/api/admin/tickets/{created['id']}",
        headers=ops,
        json={"assignee_id": "Aisha Khan", "status": "resolved"},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["assignee_id"] == "Aisha Khan"
    assert body["status"] == "resolved"

    reopened = client.patch(
        f"/api/admin/tickets/{created['id']}",
        headers=ops,
        json={"status": "open"},
    )
    assert reopened.json()["status"] == "open"


def test_packages_catalog_and_admin_update(client, acme):
    catalog = client.get("/api/packages", headers=_auth(client, "acme-admin"))
    assert catalog.status_code == 200
    plans = catalog.json()["plans"]
    ids = [plan["id"] for plan in plans]
    assert ids == ["demo", "foundation", "pro", "enterprise", "custom"]
    assert plans[2]["modules"]["chatbot"]["access"] == "included"

    ops = _auth(client, "ops")
    updated = client.patch("/api/admin/packages/pro", headers=ops, json={
        "price_label": "Pro · 2026",
        "users_included": 12,
        "modules": {
            "chatbot": {"access": "included"},
            "chronology": {"access": "included"},
            "forensic": {"access": "trial", "trial_reports": 2},
        },
    })
    assert updated.status_code == 200
    assert updated.json()["price_label"] == "Pro · 2026"
    assert updated.json()["users_included"] == 12
    assert updated.json()["modules"]["forensic"]["trial_reports"] == 2


def test_token_economics_round_trip(client, acme):
    ops = _auth(client, "ops")
    current = client.get("/api/admin/token-economics", headers=ops).json()
    assert current["provider_tokens_per_usd"] == 100
    assert current["sell_tokens_per_usd"] == 80

    saved = client.put("/api/admin/token-economics", headers=ops, json={
        "provider_tokens_per_usd": 120,
        "sell_tokens_per_usd": 90,
    }).json()
    assert saved["provider_tokens_per_usd"] == 120
    assert saved["sell_tokens_per_usd"] == 90
    assert saved["updated_by"] == "ops"


def test_access_request_approve_creates_owner_and_checkout(client, stores, acme):
    created = client.post("/api/access-requests", json={
        "full_name": "Maya Chen",
        "email": "maya@northspan.example",
        "company_name": "Northspan",
    })
    assert created.status_code == 201
    request_id = created.json()["id"]
    assert created.json()["status"] == "pending"

    duplicate = client.post("/api/access-requests", json={
        "full_name": "Maya Chen",
        "email": "maya@northspan.example",
        "company_name": "Northspan",
    })
    assert duplicate.status_code == 409

    ops = _auth(client, "ops")
    pending = client.get("/api/admin/access-requests", headers=ops).json()
    assert pending["requests"][0]["id"] == request_id

    approved = client.post(
        f"/api/admin/access-requests/{request_id}/approve", headers=ops,
    )
    assert approved.status_code == 200
    body = approved.json()
    username = body["owner"]["username"]
    password = body["owner"]["temporary_password"]
    assert username == "maya@northspan.example"
    assert password
    org_id = body["org"]["org_id"]

    owner = _auth(client, username, password)
    org = client.get("/api/org", headers=owner).json()
    assert org["org"]["name"] == "Northspan"
    assert org["subscription"]["needs_checkout"] is True
    assert org["subscription"]["plan_id"] == "demo"

    plans = client.get("/api/packages", headers=owner).json()["plans"]
    checkout = client.post("/api/org/checkout", headers=owner, json={
        "plan_id": "foundation",
    })
    assert checkout.status_code == 200
    assert checkout.json()["subscription"]["needs_checkout"] is False
    assert checkout.json()["subscription"]["plan_id"] == "foundation"

    refreshed = client.get("/api/org", headers=owner).json()
    assert refreshed["subscription"]["plan_id"] == "foundation"
    assert refreshed["policy"]["default_credits"] == next(
        plan["api_credits_usd"] for plan in plans if plan["id"] == "foundation"
    )
    assert org_id == refreshed["org"]["org_id"]


def test_access_request_deny(client, acme):
    created = client.post("/api/access-requests", json={
        "full_name": "Jordan Hale",
        "email": "jordan@hale.example",
        "company_name": "Hale Civil",
    }).json()
    ops = _auth(client, "ops")
    denied = client.post(
        f"/api/admin/access-requests/{created['id']}/deny", headers=ops,
    )
    assert denied.status_code == 200
    assert denied.json()["status"] == "denied"
    listed = client.get("/api/admin/access-requests", headers=ops).json()["requests"]
    assert listed[0]["status"] == "denied"
