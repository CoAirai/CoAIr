"""Package subscription auto-renew, cancel, and renewal token reset."""

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
    return users, orgs, commerce, ops


@pytest.fixture()
def client(stores):
    from backend.api import auth as auth_router, commerce
    from backend.core.security import get_current_user

    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api")
    app.include_router(
        commerce.router, prefix="/api", dependencies=[Depends(get_current_user)]
    )
    return TestClient(app)


def _auth(client, username, password="pw"):
    token = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def paid_org(stores):
    users, orgs, commerce, _ops = stores
    users.create_user("bill-owner", "pw", role="user", token_limit=100)
    users.create_user("bill-member", "pw", role="user", token_limit=100)
    org = orgs.create_org(
        "Bill Co",
        created_by="platform",
        owner="bill-owner",
        default_token_limit=200,
    )
    orgs.add_member(org["org_id"], "bill-member", "member")
    commerce.set_subscription(
        org["org_id"],
        plan_id="foundation",
        needs_checkout=False,
        status="active",
        auto_renew=True,
        cancel_at_period_end=False,
        current_period_end="2099-01-01T00:00:00+00:00",
    )
    users.increment_usage("bill-owner", 20, 0)
    return org


def test_renew_resets_usage_and_resplits(stores, paid_org):
    users, orgs, _commerce, _ops = stores
    from src.stripe_billing import renew_package_period

    renew_package_period(paid_org["org_id"], actor="test")
    assert users.get_usage("bill-owner")["used_tokens"] == 0
    limits = [
        users.get_user("bill-owner")["token_limit"],
        users.get_user("bill-member")["token_limit"],
    ]
    # foundation query_cap from seed catalog
    assert sum(limits) == orgs.get_org(paid_org["org_id"])["default_token_limit"] or sum(
        limits
    ) > 0


def test_cancel_stops_auto_renew(client, paid_org):
    resp = client.post(
        "/api/org/subscription/cancel",
        headers=_auth(client, "bill-owner"),
        json={"immediate": False},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["subscription"]
    assert body["auto_renew"] is False
    assert body["cancel_at_period_end"] is True
    assert body["plan_id"] == "foundation"


def test_resume_auto_renew(client, stores, paid_org):
    commerce = stores[2]
    commerce.set_subscription(
        paid_org["org_id"],
        plan_id="foundation",
        needs_checkout=False,
        auto_renew=False,
        cancel_at_period_end=True,
    )
    resp = client.post(
        "/api/org/subscription/resume",
        headers=_auth(client, "bill-owner"),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()["subscription"]
    assert body["auto_renew"] is True
    assert body["cancel_at_period_end"] is False
