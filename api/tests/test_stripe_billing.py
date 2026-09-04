"""Package fulfillment applies storage + query_cap token limits."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture()
def stores(tmp_path, monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("COAIR_DATABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    monkeypatch.delenv("SUPABASE_DB_PASSWORD", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("POSTGRES_URL", raising=False)
    from src import database as database_module
    from src import commerce_store as commerce_store_module
    from src import ops_store as ops_store_module
    from src import org_store as org_store_module
    from src import user_store as user_store_module

    monkeypatch.setattr(database_module, "use_postgres", lambda: False)
    monkeypatch.setattr(database_module, "resolve_database_url", lambda: "")
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


def test_fulfill_plan_carry_remaining_then_renew_clears(stores):
    from src.stripe_billing import fulfill_plan, renew_package_period

    users, orgs, commerce, ops = stores
    users.create_user(
        username="owner@example.com",
        password="password123",
        display_name="Owner",
        role="user",
        token_limit=1000,
    )
    org = orgs.create_org(
        "Acme", created_by="owner@example.com", owner="owner@example.com",
    )
    org_id = org["org_id"]
    pro = commerce.get_plan("pro")
    foundation = commerce.get_plan("foundation")
    assert pro and foundation

    fulfill_plan(org_id, "pro", "owner@example.com")
    # Simulate mid-cycle usage against the Pro pool.
    users.update_user("owner@example.com", token_limit=pro["query_cap"])
    users.increment_usage("owner@example.com", 200, 100)
    users.billing.update_account(
        "owner@example.com",
        storage_limit_bytes=pro["storage_limit_gb"] * 1024 ** 3,
    )
    users.billing.register_storage(
        username="owner@example.com",
        project_id="p1",
        file_id="f1",
        file_path="/tmp/f1",
        size_bytes=5 * 1024 ** 3,
    )

    remaining_tokens = pro["query_cap"] - 300
    remaining_storage = (pro["storage_limit_gb"] - 5) * 1024 ** 3

    changed = fulfill_plan(
        org_id,
        "foundation",
        "owner@example.com",
        amount_usd=0,
        carry_remaining=True,
    )
    assert changed["subscription"]["plan_id"] == "foundation"
    assert changed["carryover"]["remaining_tokens"] == remaining_tokens
    assert changed["policy"]["default_token_limit"] == (
        foundation["query_cap"] + remaining_tokens
    )
    assert changed["policy"]["default_storage_bytes"] == (
        foundation["storage_limit_gb"] * 1024 ** 3 + remaining_storage
    )
    # Usage must not reset on mid-cycle change.
    usage = users.get_usage("owner@example.com")
    assert usage["used_tokens"] == 300

    renewed = renew_package_period(org_id, actor="test")
    assert renewed["token_limit"] == foundation["query_cap"]
    refreshed = orgs.get_org(org_id)
    assert refreshed["default_token_limit"] == foundation["query_cap"]
    assert refreshed["default_storage_bytes"] == (
        foundation["storage_limit_gb"] * 1024 ** 3
    )
    assert users.get_usage("owner@example.com")["used_tokens"] == 0


def test_fulfill_purchase_tokens_increments_limit(stores):
    from src.org_quota import resolve_org_token_limit
    from src.stripe_billing import fulfill_purchase

    users, orgs, commerce, _ops = stores
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
    before = resolve_org_token_limit(
        org["org_id"], orgs=orgs, commerce=commerce
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
    after = resolve_org_token_limit(
        org["org_id"], orgs=orgs, commerce=commerce
    )
    assert after == before + 1000
    owner = users.get_user("owner@example.com")
    assert int(owner["token_limit"]) == after
