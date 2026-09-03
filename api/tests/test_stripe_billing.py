"""Package fulfillment applies storage + query_cap token limits."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture()
def stores(tmp_path, monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    from src import commerce_store as commerce_store_module
    from src import ops_store as ops_store_module
    from src import org_store as org_store_module
    from src import user_store as user_store_module

    users = user_store_module.UserStore(db_path=tmp_path / "users.db")
    orgs = org_store_module.OrgStore(db_path=tmp_path / "orgs.db")
    commerce = commerce_store_module.CommerceStore(db_path=tmp_path / "commerce.db")
    ops = ops_store_module.OpsStore(db_path=tmp_path / "ops.db")
    monkeypatch.setattr(user_store_module.UserStore, "_instance", users)
    monkeypatch.setattr(org_store_module.OrgStore, "_instance", orgs)
    monkeypatch.setattr(commerce_store_module.CommerceStore, "_instance", commerce)
    monkeypatch.setattr(ops_store_module.OpsStore, "_instance", ops)
    from src import billing_store as billing_store_module
    monkeypatch.setattr(billing_store_module.BillingStore, "_instance", users.billing)
    return users, orgs, commerce, ops


def test_fulfill_plan_sets_storage_and_query_cap(stores):
    from src.stripe_billing import fulfill_plan

    users, orgs, commerce, ops = stores
    users.create_user(
        username="owner@example.com",
        password="password123",
        display_name="Owner",
        role="user",
        token_limit=100,
    )
    org = orgs.create_org(
        "Acme", created_by="owner@example.com", owner="owner@example.com",
    )
    plan = commerce.get_plan("foundation")
    assert plan

    result = fulfill_plan(org["org_id"], "foundation", "owner@example.com")
    assert result["subscription"]["needs_checkout"] is False
    assert result["subscription"]["plan_id"] == "foundation"
    assert result["policy"]["default_token_limit"] == plan["query_cap"]
    assert result["policy"]["default_storage_bytes"] == plan["storage_limit_gb"] * 1024 ** 3

    owner = users.get_user("owner@example.com")
    assert owner["token_limit"] == plan["query_cap"]
    billing = users.billing.summary("owner@example.com")
    assert billing["storage_limit_bytes"] == plan["storage_limit_gb"] * 1024 ** 3


def test_fulfill_purchase_tokens_increments_limit(stores):
    from src.stripe_billing import fulfill_purchase

    users, orgs, _commerce, _ops = stores
    users.create_user(
        username="owner@example.com",
        password="password123",
        display_name="Owner",
        role="user",
        token_limit=500,
    )
    org = orgs.create_org(
        "Acme", created_by="owner@example.com", owner="owner@example.com",
    )
    invoice = fulfill_purchase(
        org["org_id"],
        kind="tokens",
        actor="owner@example.com",
        amount_usd=12,
        tokens=1000,
        description="Token pack 1000",
    )
    assert invoice["status"] == "paid"
    owner = users.get_user("owner@example.com")
    assert owner["token_limit"] == 1500
