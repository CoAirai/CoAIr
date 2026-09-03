"""Keep company member storage quotas aligned; token pool lives in org_token_pool."""

from __future__ import annotations

from typing import Any, Dict, Optional

from src.commerce_store import CommerceStore, get_commerce_store
from src.logger import logger
from src.org_store import OrgStore, get_org_store
from src.user_store import UserStore, get_user_store

# Historical create_user / create_org fallback — not a real package cap.
LEGACY_DEFAULT_TOKEN_LIMIT = 1_000_000


def resolve_org_token_limit(
    org_id: str,
    *,
    orgs: Optional[OrgStore] = None,
    commerce: Optional[CommerceStore] = None,
) -> int:
    orgs = orgs or get_org_store()
    commerce = commerce or get_commerce_store()
    org = orgs.get_org(org_id) or {}
    org_limit = int(org.get("default_token_limit") or 0)

    plan_cap = 0
    try:
        sub = commerce.get_subscription(org_id) or {}
        plan_id = str(sub.get("plan_id") or "")
        if plan_id:
            plan = commerce.get_plan(plan_id) or {}
            plan_cap = int(plan.get("query_cap") or 0)
    except Exception:
        plan_cap = 0

    if plan_cap > 0 and (
        org_limit <= 0 or org_limit == LEGACY_DEFAULT_TOKEN_LIMIT
    ):
        return plan_cap
    if org_limit > 0:
        return org_limit
    return plan_cap or LEGACY_DEFAULT_TOKEN_LIMIT


def sync_org_member_quotas(
    org_id: str,
    *,
    token_limit: Optional[int] = None,
    storage_limit_bytes: Optional[int] = None,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
    commerce: Optional[CommerceStore] = None,
    reset_usage: bool = False,
    equal_split: bool = True,
) -> Dict[str, Any]:
    """Sync storage defaults and equally split the company token pool."""
    orgs = orgs or get_org_store()
    users = users or get_user_store()
    commerce = commerce or get_commerce_store()
    org = orgs.get_org(org_id) or {}

    tokens = (
        int(token_limit)
        if token_limit is not None
        else resolve_org_token_limit(org_id, orgs=orgs, commerce=commerce)
    )
    storage = (
        int(storage_limit_bytes)
        if storage_limit_bytes is not None
        else int(org.get("default_storage_bytes") or 0)
    )

    updates: Dict[str, Any] = {}
    if tokens > 0 and int(org.get("default_token_limit") or 0) != tokens:
        updates["default_token_limit"] = tokens
    if storage > 0 and int(org.get("default_storage_bytes") or 0) != storage:
        updates["default_storage_bytes"] = storage
    if updates:
        orgs.update_org(org_id, **updates)

    if storage > 0:
        for member in orgs.list_members(org_id):
            username = str(member.get("username") or "")
            if not username:
                continue
            try:
                users.billing.update_account(
                    username, storage_limit_bytes=storage
                )
            except Exception:
                pass

    pool_result: Dict[str, Any] = {}
    if equal_split and tokens > 0:
        from src.org_token_pool import (
            rebalance_equal_full_pool,
            rebalance_equal_remaining,
        )

        if reset_usage:
            pool_result = rebalance_equal_full_pool(
                org_id,
                reset_usage=True,
                orgs=orgs,
                users=users,
                pool=tokens,
            )
        else:
            pool_result = rebalance_equal_remaining(
                org_id, orgs=orgs, users=users, pool=tokens
            )
    elif tokens > 0:
        # Legacy path: identical cap (avoid unless explicitly requested).
        synced = 0
        for member in orgs.list_members(org_id):
            username = str(member.get("username") or "")
            if not username:
                continue
            users.update_user(username, token_limit=tokens)
            synced += 1
        pool_result = {"synced": synced, "mode": "flat_cap"}

    logger.info(
        "org_quota_synced org=%s token_pool=%s storage=%s equal_split=%s",
        org_id,
        tokens,
        storage,
        equal_split,
    )
    return {
        "token_limit": tokens,
        "storage_limit_bytes": storage,
        "pool": pool_result,
    }
