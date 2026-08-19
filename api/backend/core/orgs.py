"""FastAPI organization-scope dependencies.

The organization is resolved from the database on every request, never from the
token. JWTs can be force-logged-out via `token_epoch`, but an `org_id` /
`org_role` claim would still keep a demoted company SuperAdmin in power until
that epoch is bumped, so membership is never trusted from the token.

Only the content path pays for this: `get_current_project` resolves company
reach inside its existing SQL, so these dependencies are used by the `/api/org`
routes alone.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from fastapi import Depends, Header, HTTPException

from backend.core.security import UserContext, get_current_user, is_admin
from src.org_store import OrgStore, get_org_store


@dataclass(frozen=True)
class OrgContext:
    org_id: str = ""
    name: str = ""
    role: str = ""            # "owner" | "member" | "" (unaffiliated)
    is_platform: bool = False  # one of our operators, acting via X-Org-ID
    policy: Dict[str, Any] = field(default_factory=dict)


def _policy(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "default_plan_type": record.get("default_plan_type", "demo"),
        "default_credits": float(record.get("default_credits") or 0),
        "default_token_limit": int(record.get("default_token_limit") or 0),
        "default_storage_bytes": int(record.get("default_storage_bytes") or 0),
        "project_limit": int(record.get("project_limit") or 0),
        "allow_member_projects": bool(record.get("allow_member_projects")),
    }


def get_current_org(
    x_org_id: Optional[str] = Header(default=None, alias="X-Org-ID"),
    user: UserContext = Depends(get_current_user),
    store: OrgStore = Depends(get_org_store),
) -> OrgContext:
    """Resolve the caller's organization.

    Platform operators have no organization of their own; `X-Org-ID` lets them
    act inside a customer's. That header is honoured **only** for operators —
    accepting it from anyone else would be a complete cross-company bypass.
    """
    if is_admin(user.role):
        requested = (x_org_id or "").strip()
        if not requested:
            return OrgContext(is_platform=True)
        record = store.get_org(requested)
        if not record:
            raise HTTPException(404, "organization_not_found")
        return OrgContext(
            org_id=record["org_id"], name=record["name"], role="owner",
            is_platform=True, policy=_policy(record),
        )

    membership = store.membership_for(user.username)
    if not membership:
        # Unaffiliated: every account that predates organizations. Nothing
        # changes for them until they are placed in one.
        return OrgContext()
    if membership.get("archived_at"):
        raise HTTPException(403, "organization_archived")
    return OrgContext(
        org_id=membership["org_id"],
        name=str(membership.get("org_name") or ""),
        role=str(membership.get("role") or "member"),
        policy=_policy(membership),
    )


def require_org(org: OrgContext = Depends(get_current_org)) -> OrgContext:
    if not org.org_id:
        raise HTTPException(403, "organization_required")
    return org


def require_org_owner(org: OrgContext = Depends(require_org)) -> OrgContext:
    """The company SuperAdmin gate."""
    if org.role != "owner":
        raise HTTPException(403, "org_owner_required")
    return org


__all__ = [
    "OrgContext",
    "get_current_org",
    "require_org",
    "require_org_owner",
]
