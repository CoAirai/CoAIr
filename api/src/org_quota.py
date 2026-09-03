"""Keep company member token/storage quotas aligned with the package."""

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
) -> Dict[str, Any]:
    """Apply org package quotas to every member (not only the owner)."""
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

    # Persist corrected org default when it was still the legacy 1M.
    updates: Dict[str, Any] = {}
    if tokens > 0 and int(org.get("default_token_limit") or 0) != tokens:
        updates["default_token_limit"] = tokens
    if storage > 0 and int(org.get("default_storage_bytes") or 0) != storage:
        updates["default_storage_bytes"] = storage
    if updates:
        orgs.update_org(org_id, **updates)

    synced = 0
    for member in orgs.list_members(org_id):
        username = str(member.get("username") or "")
        if not username:
            continue
        try:
            if tokens > 0:
                users.update_user(username, token_limit=tokens)
            if storage > 0:
                try:
                    users.billing.update_account(
                        username, storage_limit_bytes=storage
                    )
                except Exception:
                    pass
            synced += 1
        except Exception as exc:
            logger.warning(
                "org_quota_sync_failed org=%s user=%s err=%s",
                org_id,
                username,
                exc,
            )
    logger.info(
        "org_quota_synced org=%s members=%s token_limit=%s storage=%s",
        org_id,
        synced,
        tokens,
        storage,
    )
    return {
        "synced": synced,
        "token_limit": tokens,
        "storage_limit_bytes": storage,
    }
