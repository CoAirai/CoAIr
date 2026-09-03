"""POST /api/auth/login — JWT issuance + GET /api/auth/me — session probe."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.security import (
    UserContext,
    create_access_token,
    get_current_user,
    is_admin,
)
from src.ops_store import OpsStore, get_ops_store
from src.org_store import OrgStore, get_org_store
from src.supabase_auth import (
    auth_email,
    ensure_auth_user,
    sign_in_password,
    stash_mfa_session,
    take_mfa_session,
    use_supabase_auth,
)
from src.user_store import UserStore, get_user_store


router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=6)


class MfaVerifyRequest(BaseModel):
    mfa_token: str
    code: str


def _user_payload(record: Dict[str, Any], usage: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "username": record["username"],
        "display_name": record["display_name"],
        "role": record["role"],
        "features": record["features"],
        "token_limit": record["token_limit"],
        "used_tokens": usage["used_tokens"],
        "percent_remaining": usage["percent_remaining"],
        "plan_type": usage.get("plan_type", "legacy"),
        "credits_total": usage.get("credits_total", 0.0),
        "credits_remaining": usage.get("credits_remaining", 0.0),
        "credits_used": usage.get("credits_used", 0.0),
        "credit_percent_remaining": usage.get("credit_percent_remaining", 100.0),
        "storage_used_bytes": usage.get("storage_used_bytes", 0),
        "storage_limit_bytes": usage.get("storage_limit_bytes", 0),
        "storage_percent_used": usage.get("storage_percent_used", 0.0),
    }


def _issue_local_token(record: Dict[str, Any]) -> str:
    return create_access_token(
        record["username"],
        record["role"],
        token_epoch=int(record.get("token_epoch") or 0),
    )


def _bind_supabase_id(store: UserStore, username: str, session: Dict[str, Any]) -> None:
    user = session.get("user") or {}
    user_id = str(user.get("id") or "")
    if user_id:
        store.set_supabase_user_id(username, user_id)


def _supabase_login(store: UserStore, username: str, password: str) -> Dict[str, Any]:
    try:
        return sign_in_password(username, password)
    except RuntimeError:
        record = store.verify_password(username, password)
        if not record:
            raise HTTPException(401, "invalid_credentials")
        ensure_auth_user(record["username"], password)
        session = sign_in_password(record["username"], password)
        _bind_supabase_id(store, record["username"], session)
        return session


def _record_after_login(
    store: UserStore, username: str, session: Dict[str, Any] | None
) -> Dict[str, Any] | None:
    record = store.find_user(username)
    if record:
        return record
    if not session:
        return None
    user_id = str((session.get("user") or {}).get("id") or "")
    if user_id:
        return store.get_user_by_supabase_id(user_id)
    return None


@router.post("/auth/login")
async def login(
    req: LoginRequest,
    store: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
    orgs: OrgStore = Depends(get_org_store),
):
    username = req.username.strip()
    supabase_session: Dict[str, Any] | None = None
    if use_supabase_auth():
        try:
            supabase_session = _supabase_login(store, username, req.password)
        except HTTPException:
            raise
        except RuntimeError:
            raise HTTPException(401, "invalid_credentials")
        record = _record_after_login(store, username, supabase_session)
        if not record and supabase_session:
            from src.auth_provision import maybe_bootstrap_superadmin
            auth_user = supabase_session.get("user") or {}
            record = maybe_bootstrap_superadmin(
                store, auth_user, str(auth_user.get("id") or "")
            )
        if not record:
            raise HTTPException(401, "unknown_user")
        _bind_supabase_id(store, record["username"], supabase_session)
    else:
        record = store.verify_password(username, req.password)
        if not record:
            raise HTTPException(401, "invalid_credentials")
    usage = store.get_billing_summary(record["username"])
    security = ops.get_security()
    membership = orgs.membership_for(record["username"])
    if (
        security["mfa_required"]
        and not is_admin(record["role"])
        and membership
        and membership.get("role") == "owner"
    ):
        challenge = ops.create_mfa_challenge(record["username"])
        if supabase_session:
            stash_mfa_session(challenge["mfa_token"], supabase_session)
        return {
            "mfa_required": True,
            "mfa_token": challenge["mfa_token"],
            "debug_code": challenge["debug_code"],
            "user": _user_payload(record, usage),
        }
    token = (
        supabase_session["access_token"]
        if supabase_session
        else _issue_local_token(record)
    )
    from src.auth_notify import notify_login

    notify_login(record["username"], record=record, orgs=orgs)
    return {
        "access_token": token,
        "refresh_token": (supabase_session or {}).get("refresh_token"),
        "token_type": "bearer",
        "mfa_required": False,
        "user": _user_payload(record, usage),
    }


@router.post("/auth/mfa/verify")
async def verify_mfa(
    req: MfaVerifyRequest,
    store: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
    orgs: OrgStore = Depends(get_org_store),
):
    try:
        username = ops.consume_mfa_challenge(req.mfa_token, req.code)
    except ValueError as exc:
        raise HTTPException(401, str(exc)) from exc
    record = store.get_user(username)
    if not record:
        raise HTTPException(401, "unknown_user")
    usage = store.get_billing_summary(username)
    pending = take_mfa_session(req.mfa_token)
    token = pending["access_token"] if pending else _issue_local_token(record)
    from src.auth_notify import notify_login

    notify_login(username, record=record, orgs=orgs)
    return {
        "access_token": token,
        "refresh_token": (pending or {}).get("refresh_token"),
        "token_type": "bearer",
        "user": _user_payload(record, usage),
    }


@router.post("/auth/forgot-password")
async def forgot_password(
    req: ForgotPasswordRequest,
    store: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
):
    username = req.username.strip()
    record = store.find_user(username)
    token = None
    if record:
        token = ops.create_password_reset(record["username"])
    expose_token = token if record and not use_supabase_auth() else None
    return {"ok": True, "reset_token": expose_token}


@router.post("/auth/reset-password")
async def reset_password(
    req: ResetPasswordRequest,
    store: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        username = ops.consume_password_reset(req.token)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not store.get_user(username):
        raise HTTPException(400, "invalid_reset_token")
    store.update_user(username, password=req.password)
    if use_supabase_auth():
        try:
            ensure_auth_user(username, req.password)
        except RuntimeError:
            pass
    return {"ok": True}


@router.get("/auth/me")
async def me(
    user: UserContext = Depends(get_current_user),
    store: UserStore = Depends(get_user_store),
):
    record = store.get_user(user.username)
    if not record:
        raise HTTPException(401, "unknown_user")
    usage = store.get_billing_summary(user.username)
    return {"user": _user_payload(record, usage)}


@router.post("/auth/login-notify")
async def login_notify(
    user: UserContext = Depends(get_current_user),
    store: UserStore = Depends(get_user_store),
    orgs: OrgStore = Depends(get_org_store),
):
    """Fire login alert emails for browser/Supabase sessions that skipped /auth/login."""
    record = store.get_user(user.username)
    if not record:
        raise HTTPException(401, "unknown_user")
    from src.auth_notify import notify_login

    notify_login(record["username"], record=record, orgs=orgs)
    return {"ok": True}


class NotificationPrefsRequest(BaseModel):
    notify_email: Optional[bool] = None
    notify_push: Optional[bool] = None
    notify_responses: Optional[bool] = None


@router.patch("/auth/me/notifications")
async def update_my_notifications(
    req: NotificationPrefsRequest,
    user: UserContext = Depends(get_current_user),
    store: UserStore = Depends(get_user_store),
):
    record = store.get_user(user.username)
    if not record:
        raise HTTPException(401, "unknown_user")
    features = dict(record.get("features") or {})
    if req.notify_email is not None:
        features["notify_email"] = bool(req.notify_email)
    if req.notify_push is not None:
        features["notify_push"] = bool(req.notify_push)
    if req.notify_responses is not None:
        features["notify_responses"] = bool(req.notify_responses)
    store.update_user(user.username, features=features)
    refreshed = store.get_user(user.username) or record
    return {"features": refreshed.get("features") or features}


class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    phone: Optional[str] = Field(default=None, max_length=40)
    improve_model: Optional[bool] = None
    mfa_enabled: Optional[bool] = None


@router.patch("/auth/me")
async def update_my_profile(
    req: ProfileUpdateRequest,
    user: UserContext = Depends(get_current_user),
    store: UserStore = Depends(get_user_store),
):
    record = store.get_user(user.username)
    if not record:
        raise HTTPException(401, "unknown_user")
    features = dict(record.get("features") or {})
    updates: Dict[str, Any] = {}
    if req.display_name is not None:
        name = req.display_name.strip()
        if not name:
            raise HTTPException(400, "display_name_required")
        updates["display_name"] = name
    if req.phone is not None:
        features["phone"] = req.phone.strip()
    if req.improve_model is not None:
        features["improve_model"] = bool(req.improve_model)
    if req.mfa_enabled is not None:
        features["mfa_enabled"] = bool(req.mfa_enabled)
    if features != dict(record.get("features") or {}):
        updates["features"] = features
    if updates:
        store.update_user(user.username, **updates)
    refreshed = store.get_user(user.username) or record
    usage = store.get_billing_summary(user.username)
    return {"user": _user_payload(refreshed, usage)}


@router.post("/auth/logout")
async def logout():
    return {"ok": True}
