"""Wave 3 ops APIs: audit, invoices, dunning, overage, security, reset, invites."""

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
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
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
    return users, projects, orgs, commerce, ops


@pytest.fixture()
def client(stores):
    from backend.api import (
        admin_commerce,
        admin_ops,
        auth as auth_router,
        commerce,
        org_admin,
        org_ops,
    )
    from backend.core.security import get_current_user, require_admin

    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api")
    app.include_router(
        org_admin.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        commerce.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        org_ops.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    app.include_router(
        admin_commerce.router, prefix="/api", dependencies=[Depends(require_admin)]
    )
    app.include_router(
        admin_ops.router, prefix="/api", dependencies=[Depends(require_admin)]
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
def acme(stores):
    users, projects, orgs, _commerce, _ops = stores
    users.create_user("acme-admin", "pw", role="user")
    users.create_user("ops", "pw", role="admin")
    org = orgs.create_org("Acme", created_by="platform", owner="acme-admin")
    projects.create_project("Tower", "acme-admin", org_id=org["org_id"])
    return {"org": org}


def test_checkout_writes_paid_invoice_and_audit(client, acme, stores):
    owner = _auth(client, "acme-admin")
    checkout = client.post("/api/org/checkout", headers=owner, json={"plan_id": "foundation"})
    assert checkout.status_code == 200
    invoices = client.get("/api/org/invoices", headers=owner).json()["invoices"]
    assert invoices[0]["status"] == "paid"
    assert invoices[0]["company_id"] == acme["org"]["org_id"]
    # foundation $50 + default 5% tax
    assert invoices[0]["amount_usd"] == 52.5

    ops_headers = _auth(client, "ops")
    audit = client.get("/api/admin/audit", headers=ops_headers).json()["events"]
    assert any(event["action"] == "company.plan_change" for event in audit)


def test_checkout_applies_coupon_and_custom_tax(client, acme):
    ops = _auth(client, "ops")
    owner = _auth(client, "acme-admin")
    client.put(
        "/api/admin/tax",
        headers=ops,
        json={"percent": 10, "region_label": "UAE"},
    )
    client.post(
        "/api/admin/coupons",
        headers=ops,
        json={"code": "SAVE20", "discount_type": "percent", "discount_value": 20},
    )
    preview = client.post(
        "/api/org/pricing/preview",
        headers=owner,
        json={"amount_usd": 100, "coupon_code": "SAVE20"},
    )
    assert preview.status_code == 200
    assert preview.json()["total_usd"] == 88.0

    checkout = client.post(
        "/api/org/checkout",
        headers=owner,
        json={"plan_id": "foundation", "coupon_code": "SAVE20"},
    )
    assert checkout.status_code == 200
    invoice = client.get("/api/org/invoices", headers=owner).json()["invoices"][0]
    # foundation $50 - 20% = $40 + 10% tax = $44
    assert invoice["amount_usd"] == 44.0
    assert "SAVE20" in invoice["description"]
    assert "10% UAE" in invoice["description"]


def test_admin_lists_invoices(client, acme):
    ops = _auth(client, "ops")
    listed = client.get("/api/admin/invoices", headers=ops)
    assert listed.status_code == 200
    assert listed.json()["invoices"] == []


def test_admin_refunds_and_retries_invoices(client, acme):
    owner = _auth(client, "acme-admin")
    client.post("/api/org/checkout", headers=owner, json={"plan_id": "pro"})
    invoice_id = client.get("/api/org/invoices", headers=owner).json()["invoices"][0]["id"]
    ops = _auth(client, "ops")
    refunded = client.post(
        f"/api/admin/invoices/{invoice_id}/refund",
        headers=ops,
        json={"reason": "Goodwill"},
    )
    assert refunded.status_code == 200
    assert refunded.json()["status"] == "refunded"

    opened = client.post(
        "/api/admin/invoices",
        headers=ops,
        json={"org_id": acme["org"]["org_id"], "amount_usd": 199, "status": "past_due"},
    )
    assert opened.status_code == 201
    retried = client.post(
        f"/api/admin/invoices/{opened.json()['id']}/retry", headers=ops,
    )
    assert retried.json()["status"] == "open"
    cases = client.get("/api/admin/dunning", headers=ops).json()["cases"]
    assert cases[0]["company_id"] == acme["org"]["org_id"]


def test_coupons_tax_overage_and_dunning_actions(client, acme):
    ops = _auth(client, "ops")
    coupon = client.post("/api/admin/coupons", headers=ops, json={
        "code": "save10", "discount_type": "percent", "discount_value": 10,
    })
    assert coupon.status_code == 201
    assert coupon.json()["code"] == "SAVE10"
    toggled = client.post(f"/api/admin/coupons/{coupon.json()['id']}/toggle", headers=ops)
    assert toggled.json()["active"] is False

    tax = client.put("/api/admin/tax", headers=ops, json={
        "percent": 8, "region_label": "UAE",
    }).json()
    assert tax["percent"] == 8

    policy = client.put("/api/admin/overage-policy", headers=ops, json={
        "mode": "bill", "trigger_pct": 120, "notes": "Bill overage",
    }).json()
    assert policy["mode"] == "bill"

    created = client.post("/api/admin/invoices", headers=ops, json={
        "org_id": acme["org"]["org_id"], "amount_usd": 50, "status": "past_due",
    }).json()
    case_id = client.get("/api/admin/dunning", headers=ops).json()["cases"][0]["id"]
    extended = client.post(f"/api/admin/dunning/{case_id}/extend", headers=ops)
    assert extended.status_code == 200
    retried = client.post(f"/api/admin/dunning/{case_id}/retry", headers=ops)
    assert retried.json()["status"] == "retrying"
    assert created["status"] == "past_due"


def test_password_reset_and_invite(client, acme, stores):
    forgot = client.post("/api/auth/forgot-password", json={"username": "acme-admin"})
    assert forgot.status_code == 200
    token = forgot.json()["reset_token"]
    assert token
    reset = client.post("/api/auth/reset-password", json={
        "token": token, "password": "newpass1",
    })
    assert reset.status_code == 200
    assert client.post(
        "/api/auth/login", json={"username": "acme-admin", "password": "pw"}
    ).status_code == 401
    assert _auth(client, "acme-admin", "newpass1")["Authorization"].startswith(
        "Bearer "
    )

    invited = client.post("/api/org/invites", headers=_auth(client, "acme-admin", "newpass1"), json={
        "email": "surveyor@acme.example", "display_name": "Site Surveyor",
    })
    assert invited.status_code == 201
    password = invited.json()["temporary_password"]
    assert _auth(client, "surveyor@acme.example", password)["Authorization"].startswith(
        "Bearer "
    )


def test_mfa_challenge_for_company_owner(client, acme, stores):
    login = client.post("/api/auth/login", json={"username": "acme-admin", "password": "pw"})
    body = login.json()
    assert login.status_code == 200
    assert body["mfa_required"] is True
    assert "access_token" not in body
    code = body.get("debug_code")
    if not code:
        from src.email_delivery import recipient_address
        from src.ops_store import get_ops_store

        code = get_ops_store().latest_secret(
            "mfa_code", recipient_address("acme-admin")
        )
    assert code
    verified = client.post("/api/auth/mfa/verify", json={
        "mfa_token": body["mfa_token"],
        "code": code,
    })
    assert "access_token" in verified.json()

    ops_login = client.post("/api/auth/login", json={"username": "ops", "password": "pw"})
    ops_body = ops_login.json()
    assert ops_login.status_code == 200
    assert ops_body["mfa_required"] is True
    assert "access_token" not in ops_body
    ops_code = ops_body.get("debug_code")
    if not ops_code:
        from src.email_delivery import recipient_address
        from src.ops_store import get_ops_store

        ops_code = get_ops_store().latest_secret(
            "mfa_code", recipient_address("ops")
        )
    assert ops_code
    ops_verified = client.post("/api/auth/mfa/verify", json={
        "mfa_token": ops_body["mfa_token"],
        "code": ops_code,
    })
    assert "access_token" in ops_verified.json()


def test_flags_maintenance_and_announcements(client, acme):
    ops = _auth(client, "ops")
    flags = client.get("/api/admin/flags", headers=ops).json()["flags"]
    keys = {flag["key"] for flag in flags}
    assert {"embed", "analyze", "topups"} <= keys
    topups = next(flag for flag in flags if flag["key"] == "topups")
    toggled = client.put(
        f"/api/admin/flags/{topups['id']}",
        headers=ops,
        json={"enabled": True},
    )
    assert toggled.json()["enabled"] is True

    maint = client.put(
        "/api/admin/maintenance",
        headers=ops,
        json={"mode": True, "message": "Down for a bit"},
    ).json()
    assert maint["mode"] is True
    owner = _auth(client, "acme-admin")
    status = client.get("/api/org/platform-status", headers=owner).json()
    assert status["maintenance_mode"] is True
    assert status["flags"]["topups"] is True

    created = client.post(
        "/api/admin/announcements",
        headers=ops,
        json={"title": "Hello", "body": "World now"},
    )
    assert created.status_code == 201
    published = client.post(
        f"/api/admin/announcements/{created.json()['id']}/publish",
        headers=ops,
    )
    assert published.json()["status"] == "published"
    status = client.get("/api/org/platform-status", headers=owner).json()
    assert status["announcements"][0]["title"] == "Hello"


def test_topup_inbox_approve_and_deny(client, acme, stores):
    users, _projects, orgs, _commerce, _ops = stores
    users.create_user("engineer", "pw", role="user")
    orgs.add_member(acme["org"]["org_id"], "engineer", "member")
    ops = _auth(client, "ops")
    owner = _auth(client, "acme-admin")
    topups = next(
        flag
        for flag in client.get("/api/admin/flags", headers=ops).json()["flags"]
        if flag["key"] == "topups"
    )
    disabled = client.post(
        "/api/org/topups",
        headers=owner,
        json={"tokens": 1000, "amount_usd": 12.5, "reason": "Need more tokens"},
    )
    assert disabled.status_code == 403
    client.put(
        f"/api/admin/flags/{topups['id']}",
        headers=ops,
        json={"enabled": True},
    )
    assert client.post(
        "/api/org/topups",
        headers=_auth(client, "engineer"),
        json={"tokens": 1000, "amount_usd": 12.5, "reason": "Need more tokens"},
    ).status_code == 403
    created = client.post(
        "/api/org/topups",
        headers=owner,
        json={"tokens": 1000, "amount_usd": 12.5, "reason": "Need more tokens"},
    )
    assert created.status_code == 201
    request_id = created.json()["id"]
    inbox = client.get("/api/admin/topups", headers=ops).json()["requests"]
    assert inbox[0]["id"] == request_id
    approved = client.post(f"/api/admin/topups/{request_id}/approve", headers=ops)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert client.post(
        f"/api/admin/topups/{request_id}/approve", headers=ops
    ).status_code == 409

    second = client.post(
        "/api/org/topups",
        headers=owner,
        json={"tokens": 500, "amount_usd": 6, "reason": "More please extra"},
    ).json()
    denied = client.post(f"/api/admin/topups/{second['id']}/deny", headers=ops)
    assert denied.json()["status"] == "denied"
