"""
Admin-only user management endpoints. All deps gate on `require_admin`.

Accounts with operator powers (`admin`, `superadmin`) are a special case: only a
superadmin may create, promote, demote, disable or delete one. An admin can
therefore run the platform day to day without being able to manufacture peers,
remove the account above it, or promote itself.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from datetime import timedelta

from backend.core.security import (
    SUPERADMIN_ROLE,
    UserContext,
    create_access_token,
    is_admin,
    require_admin,
)
from src.auth_provision import provision_invited_user
from src.commerce_store import resolve_user_provision_limits
from src.org_store import OrgStore, get_org_store
from src.supabase_auth import (
    ensure_auth_user,
    impersonate_session,
    sign_out_user,
    use_supabase_auth,
)
from src.user_store import UserStore, get_user_store


router = APIRouter()


def _require_superadmin(actor: UserContext, action: str) -> None:
    if actor.role != SUPERADMIN_ROLE:
        raise HTTPException(403, f"superadmin_required:{action}")


def _last_active_superadmin(store: UserStore, username: str) -> bool:
    """True if `username` is the only superadmin left who can still log in."""
    remaining = [
        u for u in store.list_users()
        if u["role"] == SUPERADMIN_ROLE and u["is_active"] and u["username"] != username
    ]
    return not remaining


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=160)
    org_id: str = Field(default="", max_length=64)
    password: Optional[str] = Field(default=None, min_length=6)
    display_name: Optional[str] = None
    role: str = "user"
    token_limit: int = 1_000_000
    features: Dict[str, bool] = Field(default_factory=dict)
    plan_type: Literal["demo", "legacy"] = "demo"
    initial_credits: Optional[float] = Field(default=None, ge=0)
    markup_percent: float = Field(default=30, ge=0, le=1000)
    storage_limit_bytes: Optional[int] = Field(default=None, ge=0)
    model_policy: str = "demo-tiered-quality-v2"
    provider_key_ref: str = Field(default="", max_length=64)


class UpdateUserRequest(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    token_limit: Optional[int] = None
    features: Optional[Dict[str, bool]] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    plan_type: Optional[Literal["demo", "legacy"]] = None
    markup_percent: Optional[float] = Field(default=None, ge=0, le=1000)
    storage_limit_bytes: Optional[int] = Field(default=None, ge=0)
    model_policy: Optional[str] = None
    provider_key_ref: Optional[str] = Field(default=None, max_length=64)


def _enriched(record: Dict[str, Any], usage: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **record,
        "used_tokens": usage["used_tokens"],
        "percent_remaining": usage["percent_remaining"],
        "total_calls": usage["total_calls"],
        **{key: value for key, value in usage.items() if key not in {
            "username", "used_tokens", "token_limit", "percent_remaining",
            "prompt_tokens", "completion_tokens", "total_calls",
        }},
    }


def _enriched_user(store: UserStore, record: Dict[str, Any]) -> Dict[str, Any]:
    return _enriched(record, store.get_billing_summary(record["username"]))


@router.get("/admin/users")
def list_users(
    org_id: str = "",
    q: str = "",
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    include_inactive: bool = False,
    _admin: UserContext = Depends(require_admin),
    store: UserStore = Depends(get_user_store),
    orgs: OrgStore = Depends(get_org_store),
):
    """Accounts, filtered and paged.

    `total` is the count *after* filtering, so a table can page without asking
    twice. Enrichment (billing summary) is done only for the page being
    returned — it is a per-user query, and it used to run for every account on
    the platform on every call.
    """
    memberships = orgs.membership_map()
    needle = q.strip().casefold()

    matched = []
    for record in store.list_users():
        membership = memberships.get(record["username"])
        if org_id and (not membership or membership["org_id"] != org_id):
            continue
        if not include_inactive and not record["is_active"]:
            continue
        if needle and needle not in record["username"].casefold() \
                and needle not in (record.get("display_name") or "").casefold():
            continue
        matched.append((record, membership))

    page = matched[offset:offset + limit]
    summaries = store.list_billing_summaries()
    users = [{
        **_enriched(
            record,
            summaries.get(record["username"]) or store.get_billing_summary(record["username"]),
        ),
        "org_id": membership["org_id"] if membership else None,
        "org_name": membership["org_name"] if membership else None,
        "org_role": membership["role"] if membership else None,
    } for record, membership in page]
    return {"users": users, "total": len(matched), "limit": limit, "offset": offset}


@router.get("/admin/users/{username}/ledger")
async def user_ledger(
    username: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _admin: UserContext = Depends(require_admin),
    store: UserStore = Depends(get_user_store),
):
    """Why this account's balance is what it is: every charge and adjustment."""
    if not store.get_user(username):
        raise HTTPException(404, "user_not_found")
    return store.billing.ledger(username, limit=limit, offset=offset)


@router.post("/admin/users", status_code=201)
async def create_user(
    req: CreateUserRequest,
    admin: UserContext = Depends(require_admin),
    store: UserStore = Depends(get_user_store),
):
    operator = is_admin(req.role)
    if operator:
        _require_superadmin(admin, "create_operator")
    username = req.username.strip()
    if "@" in username:
        username = username.lower()
    password = req.password or ""
    metered_plan = "legacy" if operator else req.plan_type
    limits = resolve_user_provision_limits(
        metered_plan,
        initial_credits=req.initial_credits,
        storage_limit_bytes=req.storage_limit_bytes,
    )
    if use_supabase_auth():
        if "@" not in username:
            raise HTTPException(400, "invite_email_required")
        try:
            record = provision_invited_user(
                store,
                username,
                display_name=req.display_name,
                role=req.role,
                token_limit=req.token_limit,
                features=req.features,
                plan_type=metered_plan,
                initial_credits=0 if operator else limits["initial_credits"],
                storage_limit_bytes=0 if operator else limits["storage_limit_bytes"],
                password=password,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(502, "supabase_invite_failed") from exc
        if req.org_id:
            try:
                get_org_store().add_member(req.org_id, record["username"], "member")
            except ValueError as exc:
                raise HTTPException(409, str(exc)) from exc
        return {**_enriched_user(store, store.get_user(record["username"]) or record), "invited": True}
    if len(password) < 6:
        raise HTTPException(400, "password_required")
    try:
        record = store.create_user(
            username=username,
            password=password,
            display_name=req.display_name,
            role=req.role,
            token_limit=req.token_limit,
            features=req.features,
            # Operator accounts are not metered: no plan, no credits, no quota.
            plan_type=metered_plan,
            initial_credits=0 if operator else limits["initial_credits"],
            markup_percent=req.markup_percent,
            storage_limit_bytes=0 if operator else limits["storage_limit_bytes"],
            model_policy="" if operator else req.model_policy,
            provider_key_ref="" if operator else req.provider_key_ref,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if req.org_id:
        try:
            get_org_store().add_member(req.org_id, record["username"], "member")
        except ValueError as exc:
            store.delete_user(record["username"], soft=False)
            raise HTTPException(409, str(exc)) from exc
    return _enriched_user(store, record)


class CreditAdjustmentRequest(BaseModel):
    credits: float
    reason: str = Field(..., min_length=3, max_length=500)
    idempotency_key: str = Field(default="", max_length=120)


@router.post("/admin/users/{username}/credits")
async def adjust_credits(
    username: str,
    req: CreditAdjustmentRequest,
    _admin: UserContext = Depends(require_admin),
    store: UserStore = Depends(get_user_store),
):
    if not store.get_user(username):
        raise HTTPException(404, "user_not_found")
    try:
        return store.billing.adjust_credits(
            username, req.credits, req.reason, idempotency_key=req.idempotency_key,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.patch("/admin/users/{username}")
async def update_user(
    username: str,
    req: UpdateUserRequest,
    admin: UserContext = Depends(require_admin),
    store: UserStore = Depends(get_user_store),
):
    target = store.get_user(username)
    if not target:
        raise HTTPException(404, "user_not_found")

    # Touching an operator account, or turning a plain user into one, is a
    # superadmin action. Everything else stays available to admins.
    if is_admin(target["role"]):
        _require_superadmin(admin, "modify_operator")
    if req.role is not None and is_admin(req.role):
        _require_superadmin(admin, "promote_operator")
    if req.role is not None and req.role != target["role"] and username == admin.username:
        # No self-promotion, and no self-demotion either: dropping your own role
        # mid-session is how an operator locks itself out.
        raise HTTPException(403, "cannot_change_own_role")
    losing_superadmin = (
        target["role"] == SUPERADMIN_ROLE
        and ((req.role is not None and req.role != SUPERADMIN_ROLE) or req.is_active is False)
    )
    if losing_superadmin and _last_active_superadmin(store, username):
        raise HTTPException(409, "last_superadmin")

    raw = {k: v for k, v in req.model_dump().items() if v is not None}
    billing_keys = {
        "plan_type", "markup_percent", "storage_limit_bytes", "model_policy",
        "provider_key_ref",
    }
    payload = {k: v for k, v in raw.items() if k not in billing_keys}
    if "features" in payload:
        current_features = dict(target.get("features") or {})
        current_features.update(payload["features"] or {})
        payload["features"] = current_features
    try:
        record = store.update_user(username, **payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not record:
        raise HTTPException(404, "user_not_found")
    if use_supabase_auth() and req.password:
        try:
            uid = ensure_auth_user(username, req.password)
            store.set_supabase_user_id(username, uid)
        except RuntimeError:
            pass
    try:
        store.billing.update_account(
            username, **{k: v for k, v in raw.items() if k in billing_keys}
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return _enriched_user(store, record)


@router.post("/admin/users/{username}/reset-usage")
async def reset_usage(
    username: str,
    _admin: UserContext = Depends(require_admin),
    store: UserStore = Depends(get_user_store),
):
    if not store.get_user(username):
        raise HTTPException(404, "user_not_found")
    return store.reset_usage(username)


@router.delete("/admin/users/{username}", status_code=204)
async def delete_user(
    username: str,
    admin: UserContext = Depends(require_admin),
    store: UserStore = Depends(get_user_store),
    orgs: OrgStore = Depends(get_org_store),
):
    target = store.get_user(username)
    if not target:
        raise HTTPException(404, "user_not_found")
    if username == admin.username:
        raise HTTPException(403, "cannot_delete_self")
    if is_admin(target["role"]):
        _require_superadmin(admin, "delete_operator")
    if target["role"] == SUPERADMIN_ROLE and _last_active_superadmin(store, username):
        raise HTTPException(409, "last_superadmin")
    if not store.delete_user(username, soft=True):
        raise HTTPException(404, "user_not_found")
    membership = orgs.membership_for(username)
    if membership:
        orgs.remove_member(membership["org_id"], username)
    return None


@router.post("/admin/users/{username}/impersonate")
async def impersonate_user(
    username: str,
    admin: UserContext = Depends(require_admin),
    store: UserStore = Depends(get_user_store),
):
    if username == admin.username:
        raise HTTPException(403, "cannot_impersonate_self")
    target = store.get_user(username)
    if not target:
        raise HTTPException(404, "user_not_found")
    if not target["is_active"]:
        raise HTTPException(403, "account_disabled")
    if is_admin(target["role"]):
        raise HTTPException(403, "cannot_impersonate_operator")
    if use_supabase_auth():
        try:
            session = impersonate_session(target["username"])
            token = session["access_token"]
            refresh = session.get("refresh_token")
        except RuntimeError as exc:
            raise HTTPException(502, "supabase_impersonate_failed") from exc
    else:
        token = create_access_token(
            target["username"],
            target["role"],
            impersonator=admin.username,
            ttl=timedelta(hours=8),
            token_epoch=int(target.get("token_epoch") or 0),
        )
        refresh = None
    return {
        "access_token": token,
        "refresh_token": refresh,
        "token_type": "bearer",
        "impersonator": admin.username,
        "user": {
            "username": target["username"],
            "display_name": target["display_name"],
            "role": target["role"],
            "features": target["features"],
        },
    }


@router.post("/admin/users/{username}/force-logout")
async def force_logout_user(
    username: str,
    admin: UserContext = Depends(require_admin),
    store: UserStore = Depends(get_user_store),
):
    if username == admin.username:
        raise HTTPException(403, "cannot_force_logout_self")
    target = store.get_user(username)
    if not target:
        raise HTTPException(404, "user_not_found")
    if is_admin(target["role"]):
        _require_superadmin(admin, "force_logout_operator")
    try:
        epoch = store.bump_token_epoch(username)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    if use_supabase_auth():
        uid = str(target.get("supabase_user_id") or "")
        if uid:
            sign_out_user(uid)
    return {"username": username, "token_epoch": epoch, "ok": True}
