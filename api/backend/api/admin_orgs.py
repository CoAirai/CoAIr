"""Platform-operator routes for customer organizations.

Creating a company and appointing its SuperAdmin is our action, not a
self-service one — the router is mounted behind `require_admin`. Everything a
company then does for itself lives in `backend/api/org_admin.py`.
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.security import UserContext, require_admin
from src.auth_provision import provision_invited_user
from src.commerce_store import get_commerce_store, resolve_org_plan_limits
from src.org_store import OrgStore, get_org_store
from src.project_store import ProjectStore, get_project_store
from src.supabase_auth import use_supabase_auth
from src.user_store import UserStore, get_user_store


router = APIRouter()


class OrgCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    owner_username: str = Field(default="", max_length=160)
    owner_email: str = Field(default="", max_length=160)
    owner_display_name: str = Field(default="", max_length=160)
    default_plan_type: Literal["demo", "legacy"] = "demo"
    default_credits: Optional[float] = Field(default=None, ge=0)
    default_token_limit: int = Field(default=1_000_000, ge=0)
    default_storage_bytes: Optional[int] = Field(default=None, ge=0)
    project_limit: int = Field(default=0, ge=0)
    allow_member_projects: bool = False


class OrgUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    default_plan_type: Optional[Literal["demo", "legacy"]] = None
    default_credits: Optional[float] = Field(default=None, ge=0)
    default_token_limit: Optional[int] = Field(default=None, ge=0)
    default_storage_bytes: Optional[int] = Field(default=None, ge=0)
    project_limit: Optional[int] = Field(default=None, ge=0)
    allow_member_projects: Optional[bool] = None
    archived: Optional[bool] = None


class OrgMemberRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    role: Literal["owner", "member"] = "member"


def _with_counts(
    org: Dict[str, Any],
    counts: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        **org,
        "counts": counts.get(
            org["org_id"],
            {"members": 0, "owners": 0, "projects": 0, "archived_projects": 0},
        ),
    }


def _require_user(username: str) -> None:
    from src.user_store import get_user_store

    if not get_user_store().get_user(username):
        raise HTTPException(404, "user_not_found")


def _resolved_org_limits(req: OrgCreate) -> Dict[str, Any]:
    resolved = resolve_org_plan_limits(
        req.default_plan_type,
        credits=req.default_credits,
        storage_bytes=req.default_storage_bytes,
    )
    return {
        **resolved,
        "default_token_limit": req.default_token_limit,
    }


@router.get("/admin/orgs")
def list_orgs(
    include_archived: bool = False,
    _admin: UserContext = Depends(require_admin),
    store: OrgStore = Depends(get_org_store),
):
    counts = store.summaries()
    commerce = get_commerce_store()
    return {
        "orgs": [
            {
                **_with_counts(org, counts),
                "subscription": commerce.get_subscription(org["org_id"]),
            }
            for org in store.list_orgs(include_archived=include_archived)
        ]
    }


@router.post("/admin/orgs", status_code=201)
def create_org(
    req: OrgCreate,
    admin: UserContext = Depends(require_admin),
    store: OrgStore = Depends(get_org_store),
):
    limits = _resolved_org_limits(req)
    owner = (req.owner_email or req.owner_username).strip()
    if owner:
        users = get_user_store()
        if "@" in owner:
            owner = owner.lower()
            if use_supabase_auth():
                try:
                    record = provision_invited_user(
                        users,
                        owner,
                        display_name=req.owner_display_name or None,
                        plan_type=req.default_plan_type,
                        initial_credits=limits["default_credits"],
                        storage_limit_bytes=limits["default_storage_bytes"],
                        company_name=req.name,
                        email_kind="owner_invite",
                    )
                except ValueError as exc:
                    raise HTTPException(400, str(exc)) from exc
                except RuntimeError as exc:
                    raise HTTPException(502, "owner_invite_failed") from exc
            else:
                record = users.find_user(owner)
                if not record:
                    raise HTTPException(404, "user_not_found")
            owner = record["username"]
        elif not users.find_user(owner):
            raise HTTPException(404, "user_not_found")
    try:
        org = store.create_org(
            req.name, created_by=admin.username, owner=owner,
            default_plan_type=req.default_plan_type,
            default_credits=limits["default_credits"],
            default_token_limit=limits["default_token_limit"],
            default_storage_bytes=limits["default_storage_bytes"],
            project_limit=req.project_limit,
            allow_member_projects=req.allow_member_projects,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if req.default_plan_type == "demo":
        get_commerce_store().set_subscription(
            org["org_id"], plan_id="demo", needs_checkout=True,
        )
    return _with_counts(org, store.summaries())


@router.get("/admin/orgs/{org_id}")
async def get_org(
    org_id: str,
    _admin: UserContext = Depends(require_admin),
    store: OrgStore = Depends(get_org_store),
    projects: ProjectStore = Depends(get_project_store),
    users: UserStore = Depends(get_user_store),
):
    org = store.get_org(org_id)
    if not org:
        raise HTTPException(404, "organization_not_found")
    members = [
        member for member in store.list_members(org_id)
        if (users.get_user(member["username"]) or {}).get("is_active", True)
    ]
    from src.org_token_pool import pool_snapshot

    return {
        **_with_counts(org, store.summaries()),
        "members": members,
        "projects": projects.list_for_org(org_id),
        "subscription": get_commerce_store().get_subscription(org_id),
        "token_pool": pool_snapshot(org_id, orgs=store, users=users),
    }


@router.get("/admin/subscriptions")
def list_subscriptions(
    _admin: UserContext = Depends(require_admin),
    store: OrgStore = Depends(get_org_store),
):
    commerce = get_commerce_store()
    names = {org["org_id"]: org["name"] for org in store.list_orgs(include_archived=True)}
    rows = []
    for sub in commerce.list_subscriptions():
        org_id = str(sub.get("org_id") or "")
        rows.append({**sub, "org_name": names.get(org_id)})
    # Also surface orgs that have never written a subscription row (defaults).
    known = {str(row.get("org_id") or "") for row in rows}
    for org in store.list_orgs(include_archived=False):
        if org["org_id"] in known:
            continue
        rows.append(
            {
                **commerce.get_subscription(org["org_id"]),
                "org_id": org["org_id"],
                "org_name": org["name"],
            }
        )
    return {"subscriptions": rows}


@router.get("/admin/token-pools")
def list_token_pools(
    _admin: UserContext = Depends(require_admin),
    store: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
):
    from src.org_token_pool import pool_snapshot

    pools = [
        {
            **pool_snapshot(org["org_id"], orgs=store, users=users),
            "org_name": org["name"],
            "archived_at": org.get("archived_at"),
            "subscription": get_commerce_store().get_subscription(org["org_id"]),
        }
        for org in store.list_orgs(include_archived=False)
    ]
    return {"pools": pools}


@router.get("/admin/token-requests")
def list_token_requests(
    status: Optional[str] = None,
    _admin: UserContext = Depends(require_admin),
    store: OrgStore = Depends(get_org_store),
):
    from src.ops_store import get_ops_store

    names = {org["org_id"]: org["name"] for org in store.list_orgs(include_archived=True)}
    requests = get_ops_store().list_all_member_token_requests(status=status)
    return {
        "requests": [
            {**row, "org_name": names.get(str(row.get("org_id") or ""))}
            for row in requests
        ]
    }


@router.patch("/admin/orgs/{org_id}")
async def update_org(
    org_id: str,
    req: OrgUpdate,
    _admin: UserContext = Depends(require_admin),
    store: OrgStore = Depends(get_org_store),
):
    if not store.get_org(org_id):
        raise HTTPException(404, "organization_not_found")
    payload = {k: v for k, v in req.model_dump().items()
               if v is not None and k != "archived"}
    if payload:
        try:
            store.update_org(org_id, **payload)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    if req.archived is True:
        store.archive_org(org_id)
    elif req.archived is False:
        store.unarchive_org(org_id)
    org = store.get_org(org_id)
    if not org:
        raise HTTPException(404, "organization_not_found")
    return _with_counts(org, store.summaries())


@router.post("/admin/orgs/{org_id}/members", status_code=201)
async def add_org_member(
    org_id: str,
    req: OrgMemberRequest,
    _admin: UserContext = Depends(require_admin),
    store: OrgStore = Depends(get_org_store),
):
    """Place a user in a company — this is how a company SuperAdmin is appointed."""
    if not store.get_org(org_id):
        raise HTTPException(404, "organization_not_found")
    username = req.username.strip()
    _require_user(username)
    current = store.membership_for(username)
    if (
        current
        and current["org_id"] == org_id
        and current["role"] == "owner"
        and req.role == "member"
        and store.count_owners(org_id) <= 1
    ):
        raise HTTPException(409, "last_org_owner")
    try:
        store.add_member(org_id, username, req.role)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"ok": True, "members": store.list_members(org_id)}


@router.delete("/admin/orgs/{org_id}/members/{username}", status_code=204)
async def remove_org_member(
    org_id: str,
    username: str,
    _admin: UserContext = Depends(require_admin),
    store: OrgStore = Depends(get_org_store),
):
    if not store.remove_member(org_id, username):
        raise HTTPException(404, "user_not_found")
    return None


@router.post("/admin/orgs/{org_id}/projects/{project_id}")
async def assign_project(
    org_id: str,
    project_id: str,
    force: bool = False,
    _admin: UserContext = Depends(require_admin),
    store: OrgStore = Depends(get_org_store),
    projects: ProjectStore = Depends(get_project_store),
):
    """Attach an existing project to a company — the migration and repair path.

    Reports any member who would end up inside a company they do not belong to
    rather than silently exposing the project to that company's SuperAdmin.
    """
    if not store.get_org(org_id):
        raise HTTPException(404, "organization_not_found")
    if not projects.get(project_id):
        raise HTTPException(404, "project_not_found")

    memberships = store.membership_map(
        [m["username"] for m in projects.list_members(project_id)]
    )
    straddling = sorted(
        username for username, record in memberships.items()
        if record["org_id"] != org_id
    )
    unaffiliated = sorted(
        m["username"] for m in projects.list_members(project_id)
        if m["username"] not in memberships
    )
    if (straddling or unaffiliated) and not force:
        raise HTTPException(409, {
            "error": "members_outside_organization",
            "in_another_organization": straddling,
            "unaffiliated": unaffiliated,
        })
    try:
        updated = projects.set_org(project_id, org_id, force=force)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"project": updated, "counts": store.summary(org_id)}
