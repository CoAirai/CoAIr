from __future__ import annotations

import sqlite3

import pytest

from src.overage import evaluate_quota, should_block_quota


def test_block_mode_uses_trigger_percent():
    assert evaluate_quota(used=79, limit=100, mode="block", trigger_pct=80) == "allow"
    assert evaluate_quota(used=80, limit=100, mode="block", trigger_pct=80) == "block"
    assert evaluate_quota(
        used=50, limit=100, attempted=40, mode="block", trigger_pct=80
    ) == "block"


def test_throttle_allows_until_hard_100():
    assert (
        evaluate_quota(used=90, limit=100, mode="throttle", trigger_pct=80) == "allow"
    )
    assert (
        evaluate_quota(used=100, limit=100, mode="throttle", trigger_pct=80) == "block"
    )
    assert (
        evaluate_quota(
            used=50, limit=100, attempted=60, mode="throttle", trigger_pct=80
        )
        == "block"
    )


def test_bill_mode_never_blocks():
    assert (
        evaluate_quota(used=500, limit=100, mode="bill", trigger_pct=50) == "allow"
    )
    assert not should_block_quota(
        used=500,
        limit=100,
        attempted=10,
        policy={"mode": "bill", "trigger_pct": 50},
    )


def test_unlimited_limit_allows():
    assert evaluate_quota(used=999, limit=0, mode="block", trigger_pct=1) == "allow"


def test_bill_mode_allows_storage_past_limit(tmp_path, monkeypatch):
    from src import ops_store as ops_mod
    from src.billing_store import BillingStore

    users_db = tmp_path / "users.db"
    conn = sqlite3.connect(users_db)
    conn.execute("CREATE TABLE users(username TEXT PRIMARY KEY)")
    conn.execute("INSERT INTO users VALUES (?)", ("demo",))
    conn.commit()
    conn.close()

    billing = BillingStore(users_db)
    ops = ops_mod.OpsStore(db_path=tmp_path / "ops.db")
    monkeypatch.setattr(ops_mod.OpsStore, "_instance", ops)
    billing.provision_account(
        "demo", plan_type="pro", initial_credits=100, storage_limit_bytes=100
    )
    ops.set_overage_policy(mode="bill", trigger_pct=80, notes="allow overage")
    billing.register_storage(
        username="demo",
        project_id="p1",
        file_id="big",
        file_path="/big",
        size_bytes=250,
    )
    assert billing.summary("demo")["storage_used_bytes"] == 250


def test_block_mode_stops_storage_before_full(tmp_path, monkeypatch):
    from src import ops_store as ops_mod
    from src.billing_store import BillingStore, StorageQuotaExceededError

    users_db = tmp_path / "users.db"
    conn = sqlite3.connect(users_db)
    conn.execute("CREATE TABLE users(username TEXT PRIMARY KEY)")
    conn.execute("INSERT INTO users VALUES (?)", ("demo",))
    conn.commit()
    conn.close()

    billing = BillingStore(users_db)
    ops = ops_mod.OpsStore(db_path=tmp_path / "ops.db")
    monkeypatch.setattr(ops_mod.OpsStore, "_instance", ops)
    billing.provision_account(
        "demo", plan_type="pro", initial_credits=100, storage_limit_bytes=100
    )
    ops.set_overage_policy(mode="block", trigger_pct=50, notes="")
    with pytest.raises(StorageQuotaExceededError):
        billing.register_storage(
            username="demo",
            project_id="p1",
            file_id="a",
            file_path="/a",
            size_bytes=60,
        )
