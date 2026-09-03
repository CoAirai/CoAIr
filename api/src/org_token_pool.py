"""Shared company token pool: equal split, mid-cycle rebalance, transfers."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from src.logger import logger
from src.org_quota import resolve_org_token_limit
from src.org_store import OrgStore, get_org_store
from src.user_store import UserStore, get_user_store


def company_pool(
    org_id: str,
    *,
    orgs: Optional[OrgStore] = None,
) -> int:
    return int(resolve_org_token_limit(org_id, orgs=orgs))


def _active_usernames(
    org_id: str,
    *,
    orgs: OrgStore,
    users: UserStore,
) -> List[str]:
    names: List[str] = []
    for member in orgs.list_members(org_id):
        username = str(member.get("username") or "")
        if not username:
            continue
        record = users.get_user(username)
        if not record or not record.get("is_active", True):
            continue
        names.append(username)
    return names


def _used(users: UserStore, username: str) -> int:
    return int(users.get_usage(username).get("used_tokens") or 0)


def _split_remaining(remaining: int, n: int) -> List[int]:
    if n <= 0:
        return []
    remaining = max(0, int(remaining))
    base = remaining // n
    extra = remaining % n
    return [base + (1 if i < extra else 0) for i in range(n)]


def rebalance_equal_remaining(
    org_id: str,
    *,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
    pool: Optional[int] = None,
) -> Dict[str, Any]:
    """Mid-cycle: share remaining company tokens equally; keep prior usage."""
    orgs = orgs or get_org_store()
    users = users or get_user_store()
    names = _active_usernames(org_id, orgs=orgs, users=users)
    pool_total = int(pool) if pool is not None else company_pool(org_id, orgs=orgs)
    if not names:
        return {
            "org_id": org_id,
            "pool": pool_total,
            "members": 0,
            "remaining": 0,
            "allocations": {},
        }

    used_by = {name: _used(users, name) for name in names}
    total_used = sum(used_by.values())
    remaining = max(0, pool_total - total_used)
    shares = _split_remaining(remaining, len(names))
    allocations: Dict[str, int] = {}
    for name, share in zip(names, shares):
        new_limit = used_by[name] + share
        users.update_user(name, token_limit=new_limit)
        allocations[name] = new_limit

    logger.info(
        "org_pool_rebalance_remaining org=%s pool=%s used=%s remaining=%s members=%s",
        org_id,
        pool_total,
        total_used,
        remaining,
        len(names),
    )
    return {
        "org_id": org_id,
        "pool": pool_total,
        "members": len(names),
        "remaining": remaining,
        "total_used": total_used,
        "allocations": allocations,
    }


def rebalance_equal_full_pool(
    org_id: str,
    *,
    reset_usage: bool = True,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
    pool: Optional[int] = None,
) -> Dict[str, Any]:
    """Full equal split of the company pool (monthly reset / initial)."""
    orgs = orgs or get_org_store()
    users = users or get_user_store()
    names = _active_usernames(org_id, orgs=orgs, users=users)
    pool_total = int(pool) if pool is not None else company_pool(org_id, orgs=orgs)
    if not names:
        return {
            "org_id": org_id,
            "pool": pool_total,
            "members": 0,
            "allocations": {},
        }

    shares = _split_remaining(pool_total, len(names))
    allocations: Dict[str, int] = {}
    for name, share in zip(names, shares):
        if reset_usage:
            try:
                users.reset_usage(name)
            except Exception as exc:
                logger.warning(
                    "org_pool_reset_usage_failed org=%s user=%s err=%s",
                    org_id,
                    name,
                    exc,
                )
        users.update_user(name, token_limit=share)
        allocations[name] = share

    logger.info(
        "org_pool_rebalance_full org=%s pool=%s members=%s reset=%s",
        org_id,
        pool_total,
        len(names),
        reset_usage,
    )
    return {
        "org_id": org_id,
        "pool": pool_total,
        "members": len(names),
        "allocations": allocations,
        "reset_usage": reset_usage,
    }


def transfer_unused(
    org_id: str,
    from_username: str,
    to_username: str,
    tokens: int,
    *,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
) -> Dict[str, Any]:
    """Move unused headroom from donor to recipient within the same org."""
    orgs = orgs or get_org_store()
    users = users or get_user_store()
    tokens = int(tokens)
    if tokens < 1:
        raise ValueError("tokens_required")

    donor = from_username.strip()
    recipient = to_username.strip()
    if not donor or not recipient or donor.lower() == recipient.lower():
        raise ValueError("invalid_transfer_users")

    members = {m["username"] for m in orgs.list_members(org_id)}
    if donor not in members or recipient not in members:
        raise ValueError("users_not_in_org")

    donor_user = users.get_user(donor)
    recip_user = users.get_user(recipient)
    if not donor_user or not recip_user:
        raise ValueError("user_not_found")

    donor_used = _used(users, donor)
    donor_limit = int(donor_user.get("token_limit") or 0)
    donor_unused = max(0, donor_limit - donor_used)
    move = min(tokens, donor_unused)
    if move < 1:
        raise ValueError("insufficient_unused_tokens")

    recip_limit = int(recip_user.get("token_limit") or 0)
    users.update_user(donor, token_limit=donor_limit - move)
    users.update_user(recipient, token_limit=recip_limit + move)

    logger.info(
        "org_pool_transfer org=%s from=%s to=%s tokens=%s",
        org_id,
        donor,
        recipient,
        move,
    )
    return {
        "org_id": org_id,
        "from_username": donor,
        "to_username": recipient,
        "tokens": move,
        "from_limit": donor_limit - move,
        "to_limit": recip_limit + move,
    }


def pool_snapshot(
    org_id: str,
    *,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
) -> Dict[str, Any]:
    orgs = orgs or get_org_store()
    users = users or get_user_store()
    pool_total = company_pool(org_id, orgs=orgs)
    members: List[Dict[str, Any]] = []
    total_used = 0
    for username in _active_usernames(org_id, orgs=orgs, users=users):
        record = users.get_user(username) or {}
        used = _used(users, username)
        limit = int(record.get("token_limit") or 0)
        total_used += used
        members.append(
            {
                "username": username,
                "display_name": record.get("display_name") or username,
                "used_tokens": used,
                "token_limit": limit,
                "remaining": max(0, limit - used),
            }
        )
    return {
        "org_id": org_id,
        "pool": pool_total,
        "total_used": total_used,
        "remaining": max(0, pool_total - total_used),
        "member_count": len(members),
        "equal_share": (pool_total // len(members)) if members else 0,
        "members": members,
    }
