"""Unit tests for shared company token pool allocator."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.org_token_pool import (
    _split_remaining,
    rebalance_equal_full_pool,
    rebalance_equal_remaining,
    transfer_unused,
)


@pytest.fixture()
def stores(tmp_path, monkeypatch):
    from src import org_store as org_store_module
    from src import project_store as project_store_module
    from src import user_store as user_store_module

    users = user_store_module.UserStore(db_path=tmp_path / "users.db")
    projects = project_store_module.ProjectStore(db_path=tmp_path / "projects.db")
    orgs = org_store_module.OrgStore(db_path=tmp_path / "projects.db")
    monkeypatch.setattr(user_store_module.UserStore, "_instance", users)
    monkeypatch.setattr(project_store_module.ProjectStore, "_instance", projects)
    monkeypatch.setattr(org_store_module.OrgStore, "_instance", orgs)
    return users, orgs


def test_split_remaining_distributes_remainder():
    assert _split_remaining(100, 3) == [34, 33, 33]
    assert sum(_split_remaining(100, 3)) == 100
    assert _split_remaining(70, 4) == [18, 18, 17, 17]
    assert sum(_split_remaining(70, 4)) == 70


def test_rebalance_remaining_keeps_usage(stores):
    users, orgs = stores
    users.create_user("pool-owner", "pw", token_limit=34)
    users.create_user("pool-a", "pw", token_limit=33)
    users.create_user("pool-b", "pw", token_limit=33)
    org = orgs.create_org(
        name="Pool Co", owner="pool-owner", default_token_limit=100
    )
    org_id = org["org_id"]
    orgs.add_member(org_id, "pool-a", "member")
    orgs.add_member(org_id, "pool-b", "member")

    users.increment_usage("pool-owner", 3, 0)
    users.increment_usage("pool-a", 3, 0)
    users.increment_usage("pool-b", 3, 0)

    result = rebalance_equal_remaining(
        org_id, orgs=orgs, users=users, pool=100
    )
    assert result["remaining"] == 91
    unused_total = 0
    for name in ("pool-owner", "pool-a", "pool-b"):
        used = users.get_usage(name)["used_tokens"]
        limit = users.get_user(name)["token_limit"]
        assert used == 3
        unused_total += limit - used
    assert unused_total == 91


def test_transfer_unused_clamps(stores):
    users, orgs = stores
    users.create_user("xfer-owner", "pw", token_limit=50)
    users.create_user("xfer-member", "pw", token_limit=10)
    org = orgs.create_org(
        name="Xfer Co", owner="xfer-owner", default_token_limit=100
    )
    org_id = org["org_id"]
    orgs.add_member(org_id, "xfer-member", "member")
    users.increment_usage("xfer-owner", 40, 0)

    moved = transfer_unused(
        org_id, "xfer-owner", "xfer-member", 100, orgs=orgs, users=users
    )
    assert moved["tokens"] == 10
    assert users.get_user("xfer-owner")["token_limit"] == 40
    assert users.get_user("xfer-member")["token_limit"] == 20


def test_full_pool_reset(stores):
    users, orgs = stores
    users.create_user("full-owner", "pw", token_limit=30)
    users.create_user("full-a", "pw", token_limit=30)
    users.create_user("full-b", "pw", token_limit=30)
    org = orgs.create_org(
        name="Full Co", owner="full-owner", default_token_limit=90
    )
    org_id = org["org_id"]
    orgs.add_member(org_id, "full-a", "member")
    orgs.add_member(org_id, "full-b", "member")
    users.increment_usage("full-a", 5, 5)

    result = rebalance_equal_full_pool(
        org_id, reset_usage=True, orgs=orgs, users=users, pool=90
    )
    assert result["allocations"]["full-a"] == 30
    assert users.get_usage("full-a")["used_tokens"] == 0
