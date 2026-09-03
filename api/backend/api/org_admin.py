"""The company SuperAdmin surface.

An organization's `owner` administers its own company: it sees every project the
company owns, creates the company's user accounts, and grants those users access
to individual projects.

Mounted behind `get_current_user` only — never behind `require_admin`. A company
SuperAdmin must not inherit platform powers, so every route here carries its own
`require_org` / `require_org_owner` gate, and the handlers below re-check that
the project and the target user belong to the caller's own company.

Two rules that the tests pin, because getting either wrong hands out something
that is not ours to give:
  * accounts created here are always plain `user` accounts on the org's own
    plan — an org owner can neither mint operators nor mint credits;
  * responses are a field whitelist, never `admin_users._enriched`, which
    carries our markup, model policy and provider-key posture.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.orgs import OrgContext, require_org, require_org_owner
from backend.core.security import UserContext, get_current_user
from src.auth_provision import provision_invited_user
from src.commerce_store import CommerceStore, get_commerce_store
from src.org_store import OrgStore, get_org_store
from src.project_store import PROJECT_ROLES, ProjectStore, get_project_store
from src.supabase_auth import ensure_auth_user, use_supabase_auth
from src.user_store import UserStore, get_user_store


router = APIRouter()

# Flags a company may set on its own users. Deliberately excludes `corpus`,
# which selects a legacy bulk document set that predates projects.
ORG_ASSIGNABLE_FEATURES = (
    "correspondence",
    "provider_compare",
    "projectAccess",
    "chronology",
    "forensic",
    "upload",
    "download",
    "reports",
)

# What a company admin may see about its own users. Everything omitted here is
# commercial data of ours: markup_percent, model_policy, dedicated_provider_key,
# estimated_provider_cost_usd, uncovered_*.
_ORG_USER_FIELDS = (
    "username", "display_name", "is_active", "created_at", "updated_at",
    "token_limit", "used_tokens", "percent_remaining", "total_calls",
    "plan_type", "credits_total", "credits_remaining", "credits_used",
    "credit_percent_remaining", "storage_used_bytes", "storage_limit_bytes",
    "storage_percent_used",
)


class OrgUserCreate(BaseModel):
    # No `role`: accounts created by a company are always plain users.
    username: str = Field(min_length=3, max_length=160)
    password: Optional[str] = Field(default=None, min_length=6)
    display_name: Optional[str] = None
    features: Dict[str, bool] = Field(default_factory=dict)


class OrgUserUpdate(BaseModel):
    display_name: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=6)
    is_active: Optional[bool] = None
    features: Optional[Dict[str, bool]] = None
    org_role: Optional[Literal["owner", "member"]] = None


class ProjectGrant(BaseModel):
    role: Literal["owner", "editor", "viewer"] = "editor"


def _assignable_features(features: Dict[str, bool]) -> Dict[str, bool]:
    return {k: bool(v) for k, v in (features or {}).items()
            if k in ORG_ASSIGNABLE_FEATURES}


def _org_user(store: UserStore, record: Dict[str, Any], org_role: str) -> Dict[str, Any]:
    usage = store.get_billing_summary(record["username"])
    merged = {**record, **usage}
    out = {key: merged.get(key) for key in _ORG_USER_FIELDS}
    out["features"] = {k: v for k, v in (record.get("features") or {}).items()
                       if k in ORG_ASSIGNABLE_FEATURES}
    out["org_role"] = org_role
    return out


def _same_org_user(orgs: OrgStore, org: OrgContext, username: str) -> str:
    """The target's org role, or 404.

    404 rather than 403 on purpose: a company must not be able to discover which
    usernames exist elsewhere on the platform by probing this route.
    """
    membership = orgs.membership_for(username)
    if not membership or membership["org_id"] != org.org_id:
        raise HTTPException(404, "user_not_found")
    return str(membership["role"])


def _owned_project(projects: ProjectStore, org: OrgContext, project_id: str) -> Dict[str, Any]:
    record = projects.get_for_org(project_id, org.org_id)
    if not record:
        raise HTTPException(404, "project_not_found")
    return record


# ── The company itself ──────────────────────────────────────


@router.get("/org")
async def read_org(
    org: OrgContext = Depends(require_org),
    orgs: OrgStore = Depends(get_org_store),
    commerce: CommerceStore = Depends(get_commerce_store),
):
    """The caller's company. Available to every member, not just the owner."""
    record = orgs.get_org(org.org_id) or {}
    return {
        "org": {key: record.get(key) for key in
                ("org_id", "name", "slug", "created_at", "archived_at")},
        "role": org.role,
        "policy": org.policy,
        "counts": orgs.summary(org.org_id),
        "subscription": commerce.get_subscription(org.org_id),
    }


# ── The company's users ─────────────────────────────────────


@router.get("/org/users")
async def list_org_users(
    org: OrgContext = Depends(require_org_owner),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
    projects: ProjectStore = Depends(get_project_store),
):
    # Mid-cycle rebalance runs on invite/create — do not reshuffle every list.
    project_ids = {p["project_id"] for p in projects.list_for_org(org.org_id)}
    grants: Dict[str, int] = {}
    for project_id in project_ids:
        for member in projects.list_members(project_id):
            grants[member["username"]] = grants.get(member["username"], 0) + 1

    out: List[Dict[str, Any]] = []
    for member in orgs.list_members(org.org_id):
        record = users.get_user(member["username"])
        if not record or not record.get("is_active", True):
            continue
        entry = _org_user(users, record, member["role"])
        entry["project_count"] = grants.get(member["username"], 0)
        out.append(entry)
    return {"users": out}


@router.post("/org/users", status_code=201)
async def create_org_user(
    req: OrgUserCreate,
    org: OrgContext = Depends(require_org_owner),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
):
    """Create an account inside the caller's company.

    Plan, credits, quota and storage all come from the company's policy, which
    only a platform operator can change — otherwise a company SuperAdmin could
    provision itself unlimited credits.
    """
    from src.org_token_pool import rebalance_equal_remaining

    username = req.username.strip()
    if "@" in username:
        username = username.lower()
    password = req.password or ""
    package_storage = int(org.policy.get("default_storage_bytes") or 0)
    # Provisional limit; rebalance assigns equal share of remaining pool.
    if use_supabase_auth():
        if "@" not in username:
            raise HTTPException(400, "invite_email_required")
        try:
            record = provision_invited_user(
                users,
                username,
                display_name=req.display_name,
                features=_assignable_features(req.features),
                plan_type=org.policy.get("default_plan_type", "demo"),
                initial_credits=org.policy.get("default_credits", 0),
                storage_limit_bytes=package_storage,
                token_limit=0,
                password=password,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(502, "supabase_invite_failed") from exc
        try:
            orgs.add_member(org.org_id, record["username"], "member")
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        rebalance_equal_remaining(org.org_id, orgs=orgs, users=users)
        return _org_user(users, users.get_user(record["username"]) or record, "member")
    if len(password) < 6:
        raise HTTPException(400, "password_required")
    try:
        record = users.create_user(
            username=username,
            password=password,
            display_name=req.display_name,
            role="user",
            token_limit=0,
            features=_assignable_features(req.features),
            plan_type=org.policy.get("default_plan_type", "demo"),
            initial_credits=org.policy.get("default_credits", 0),
            storage_limit_bytes=package_storage,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    try:
        orgs.add_member(org.org_id, username, "member")
    except ValueError as exc:
        # Never leave an account that belongs to no company: it would be
        # invisible to its own creator and reachable by nobody.
        users.delete_user(username, soft=False)
        raise HTTPException(409, str(exc)) from exc
    rebalance_equal_remaining(org.org_id, orgs=orgs, users=users)
    refreshed = users.get_user(username) or record
    return _org_user(users, refreshed, "member")


@router.patch("/org/users/{username}")
async def update_org_user(
    username: str,
    req: OrgUserUpdate,
    org: OrgContext = Depends(require_org_owner),
    actor: UserContext = Depends(get_current_user),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
):
    current_role = _same_org_user(orgs, org, username)

    if req.org_role is not None and req.org_role != current_role:
        if username == actor.username:
            raise HTTPException(403, "cannot_change_own_role")
        if current_role == "owner" and orgs.count_owners(org.org_id) <= 1:
            raise HTTPException(409, "last_org_owner")
    if req.is_active is False and current_role == "owner" \
            and orgs.count_owners(org.org_id) <= 1:
        raise HTTPException(409, "last_org_owner")

    payload: Dict[str, Any] = {}
    if req.display_name is not None:
        payload["display_name"] = req.display_name
    if req.password is not None:
        payload["password"] = req.password
    if req.is_active is not None:
        payload["is_active"] = req.is_active
    if req.features is not None:
        current_features = dict((users.get_user(username) or {}).get("features") or {})
        for key, value in _assignable_features(req.features).items():
            current_features[key] = value
        payload["features"] = current_features
    record = users.update_user(username, **payload) if payload else users.get_user(username)
    if not record:
        raise HTTPException(404, "user_not_found")
    if req.password is not None and use_supabase_auth():
        try:
            uid = ensure_auth_user(username, req.password)
            users.set_supabase_user_id(username, uid)
        except RuntimeError:
            pass

    if req.org_role is not None and req.org_role != current_role:
        orgs.add_member(org.org_id, username, req.org_role)
        current_role = req.org_role
    return _org_user(users, record, current_role)


@router.delete("/org/users/{username}", status_code=204)
async def delete_org_user(
    username: str,
    org: OrgContext = Depends(require_org_owner),
    actor: UserContext = Depends(get_current_user),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
):
    current_role = _same_org_user(orgs, org, username)
    if username == actor.username:
        raise HTTPException(403, "cannot_delete_self")
    if current_role == "owner" and orgs.count_owners(org.org_id) <= 1:
        raise HTTPException(409, "last_org_owner")
    users.delete_user(username, soft=True)
    orgs.remove_member(org.org_id, username)
    return None


# ── The company's projects and who may reach them ───────────


@router.get("/org/usage")
async def org_usage(
    date_from: str = "",
    date_to: str = "",
    org: OrgContext = Depends(require_org_owner),
    projects: ProjectStore = Depends(get_project_store),
):
    """What this company has spent, rolled up from its own projects.

    Credits only. `estimated_provider_cost_usd` and the uncovered-cost figures
    are our cost basis and margin, so they are dropped here even though the
    underlying query produces them.
    """
    from src.billing_store import get_billing_store

    project_ids = [p["project_id"] for p in
                   projects.list_for_org(org.org_id, include_archived=True)]
    if not project_ids:
        return {"groups": [], "totals": {"calls": 0, "prompt_tokens": 0,
                                         "completion_tokens": 0, "credits_used": 0.0}}

    groups = get_billing_store().usage(
        project_ids=project_ids, date_from=date_from, date_to=date_to,
    )["groups"]
    visible = [{key: row[key] for key in (
        "project_id", "username", "provider", "model", "task_type",
        "calls", "prompt_tokens", "completion_tokens", "reasoning_tokens",
        "cached_tokens", "debited_credit",
    ) if key in row} for row in groups]
    return {
        "groups": visible,
        "totals": {
            "calls": sum(int(r.get("calls") or 0) for r in visible),
            "prompt_tokens": sum(int(r.get("prompt_tokens") or 0) for r in visible),
            "completion_tokens": sum(int(r.get("completion_tokens") or 0) for r in visible),
            "credits_used": round(sum(float(r.get("debited_credit") or 0)
                                      for r in visible), 6),
        },
    }


@router.get("/org/projects")
async def list_org_projects(
    org: OrgContext = Depends(require_org_owner),
    projects: ProjectStore = Depends(get_project_store),
):
    return {"projects": projects.list_for_org(org.org_id)}


@router.get("/org/projects/{project_id}/members")
async def list_project_members(
    project_id: str,
    org: OrgContext = Depends(require_org_owner),
    projects: ProjectStore = Depends(get_project_store),
    users: UserStore = Depends(get_user_store),
):
    _owned_project(projects, org, project_id)
    out = []
    for member in projects.list_members(project_id):
        record = users.get_user(member["username"]) or {}
        out.append({
            "username": member["username"],
            "display_name": record.get("display_name") or member["username"],
            "role": member["role"],
            "created_at": member["created_at"],
            "is_active": bool(record.get("is_active", False)),
        })
    return {"members": out}


@router.put("/org/projects/{project_id}/members/{username}")
async def grant_project_access(
    project_id: str,
    username: str,
    req: ProjectGrant,
    org: OrgContext = Depends(require_org_owner),
    orgs: OrgStore = Depends(get_org_store),
    projects: ProjectStore = Depends(get_project_store),
):
    """Give one of the company's users access to one of the company's projects."""
    _owned_project(projects, org, project_id)
    membership = orgs.membership_for(username)
    if not membership or membership["org_id"] != org.org_id:
        # Both sides must belong to this company. Without this a SuperAdmin
        # could pull a rival company's employee into its own project.
        raise HTTPException(422, "user_not_in_organization")
    if req.role not in PROJECT_ROLES:
        raise HTTPException(422, "invalid_project_role")
    try:
        projects.add_member(project_id, username, req.role)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"ok": True, "members": projects.list_members(project_id)}


@router.delete("/org/projects/{project_id}/members/{username}", status_code=204)
async def revoke_project_access(
    project_id: str,
    username: str,
    org: OrgContext = Depends(require_org_owner),
    projects: ProjectStore = Depends(get_project_store),
):
    _owned_project(projects, org, project_id)
    try:
        removed = projects.remove_member(project_id, username)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if not removed:
        raise HTTPException(404, "user_not_found")
    return None
