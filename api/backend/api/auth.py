"""POST /api/auth/login — JWT issuance + GET /api/auth/me — session probe."""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend.core.platform_guard import (
    client_ip,
    expose_security_debug,
    rate_limit,
)
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
from src.user_store import (
    ACCOUNT_ACTIVE,
    ACCOUNT_INVITED,
    SUPERADMIN_ROLE,
    UserStore,
    account_auth_error,
    get_user_store,
    normalize_account_status,
)


router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str
    device_token: str = Field(default="", max_length=200)


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=6)


class MfaVerifyRequest(BaseModel):
    mfa_token: str
    code: str
    remember_device: bool = False


class EmailSendCodeRequest(BaseModel):
    email: str = Field(min_length=3, max_length=160)
    purpose: Literal["signup", "invite"] = "signup"


class EmailVerifyCodeRequest(BaseModel):
    challenge_id: str = Field(min_length=8, max_length=200)
    code: str = Field(min_length=4, max_length=12)


class InviteActivateRequest(BaseModel):
    token: str = Field(min_length=8, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    code: str = Field(default="", min_length=0, max_length=12)
    # Optional; when provided must match the invitation bound to the token.
    email: str = Field(default="", min_length=0, max_length=160)
    org_id: str = Field(default="", min_length=0, max_length=80)
    email_verification_token: str = Field(default="", min_length=0, max_length=200)
    challenge_id: str = Field(default="", min_length=0, max_length=200)


class InviteResendRequest(BaseModel):
    email: str = Field(default="", min_length=0, max_length=160)
    token: str = Field(default="", min_length=0, max_length=200)


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


def _issue_local_token(record: Dict[str, Any], *, timeout_minutes: int = 0) -> str:
    ttl = timedelta(minutes=timeout_minutes) if timeout_minutes > 0 else None
    return create_access_token(
        record["username"],
        record["role"],
        token_epoch=int(record.get("token_epoch") or 0),
        ttl=ttl,
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
    request: Request,
    store: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
    orgs: OrgStore = Depends(get_org_store),
):
    ip = client_ip(request) or "unknown"
    rate_limit(f"auth:login:{ip}", limit=20, window_seconds=60)
    username = req.username.strip()
    rate_limit(f"auth:login-user:{username.lower()}", limit=10, window_seconds=60)
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
        status = normalize_account_status(
            record.get("account_status"), is_active=bool(record.get("is_active"))
        )
        if status != ACCOUNT_ACTIVE:
            raise HTTPException(403, account_auth_error(status))
        _bind_supabase_id(store, record["username"], supabase_session)
    else:
        pending = store.find_user(username)
        if pending:
            status = normalize_account_status(
                pending.get("account_status"),
                is_active=bool(pending.get("is_active")),
            )
            if status != ACCOUNT_ACTIVE:
                raise HTTPException(403, account_auth_error(status))
        record = store.verify_password(username, req.password)
        if not record:
            raise HTTPException(401, "invalid_credentials")
        status = normalize_account_status(
            record.get("account_status"), is_active=bool(record.get("is_active"))
        )
        if status != ACCOUNT_ACTIVE:
            raise HTTPException(403, account_auth_error(status))
    usage = store.get_billing_summary(record["username"])
    security = ops.get_security()
    timeout_minutes = int(security.get("session_timeout_minutes") or 30)
    # Platform super admins always complete email MFA. Company admins/members
    # may skip MFA for 30 days on a remembered device.
    device_token = (req.device_token or "").strip()
    if (
        record["role"] != SUPERADMIN_ROLE
        and device_token
        and ops.consume_trusted_device(record["username"], device_token)
    ):
        from src.auth_notify import notify_login

        notify_login(record["username"], record=record, orgs=orgs)
        token = (
            (supabase_session or {}).get("access_token")
            if supabase_session
            else _issue_local_token(record, timeout_minutes=timeout_minutes)
        )
        if not token and supabase_session:
            # Prefer local JWT if Supabase session shape is incomplete.
            token = _issue_local_token(record, timeout_minutes=timeout_minutes)
        return {
            "access_token": token,
            "refresh_token": (supabase_session or {}).get("refresh_token"),
            "token_type": "bearer",
            "mfa_required": False,
            "session_timeout_minutes": timeout_minutes,
            "user": _user_payload(record, usage),
            "trusted_device": True,
        }

    # Email MFA is required for every successful password login (users,
    # company admins, and platform super admins) unless a trusted device matched.
    challenge = ops.create_mfa_challenge(record["username"])
    if supabase_session:
        stash_mfa_session(challenge["mfa_token"], supabase_session)
    payload = {
        "mfa_required": True,
        "mfa_token": challenge["mfa_token"],
        "user": _user_payload(record, usage),
        "session_timeout_minutes": timeout_minutes,
    }
    if "debug_code" in challenge:
        payload["debug_code"] = challenge["debug_code"]
    return payload


@router.post("/auth/mfa/verify")
async def verify_mfa(
    req: MfaVerifyRequest,
    request: Request,
    store: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
    orgs: OrgStore = Depends(get_org_store),
):
    ip = client_ip(request) or "unknown"
    rate_limit(f"auth:mfa:{ip}", limit=10, window_seconds=60)
    rate_limit(f"auth:mfa-token:{req.mfa_token}", limit=10, window_seconds=60)
    try:
        username = ops.consume_mfa_challenge(req.mfa_token, req.code)
    except ValueError as exc:
        raise HTTPException(401, str(exc)) from exc
    rate_limit(f"auth:mfa-user:{username.lower()}", limit=10, window_seconds=60)
    record = store.get_user(username)
    if not record:
        raise HTTPException(401, "unknown_user")
    status = normalize_account_status(
        record.get("account_status"), is_active=bool(record.get("is_active"))
    )
    if status != ACCOUNT_ACTIVE:
        raise HTTPException(403, account_auth_error(status))
    usage = store.get_billing_summary(username)
    timeout_minutes = int(ops.get_security().get("session_timeout_minutes") or 30)
    pending = take_mfa_session(req.mfa_token)
    token = (
        pending["access_token"]
        if pending
        else _issue_local_token(record, timeout_minutes=timeout_minutes)
    )
    from src.auth_notify import notify_login

    notify_login(username, record=record, orgs=orgs)
    payload = {
        "access_token": token,
        "refresh_token": (pending or {}).get("refresh_token"),
        "token_type": "bearer",
        "session_timeout_minutes": timeout_minutes,
        "user": _user_payload(record, usage),
    }
    if req.remember_device and record["role"] != SUPERADMIN_ROLE:
        trusted = ops.create_trusted_device(username, label="browser")
        payload["device_token"] = trusted["device_token"]
        payload["device_expires_at"] = trusted["expires_at"]
    return payload


@router.post("/auth/email/send-code")
async def send_email_code(
    req: EmailSendCodeRequest,
    request: Request,
    ops: OpsStore = Depends(get_ops_store),
):
    ip = client_ip(request) or "unknown"
    email = req.email.strip().lower()
    rate_limit(f"auth:email-send:{ip}", limit=8, window_seconds=60)
    rate_limit(f"auth:email-send-addr:{email}", limit=5, window_seconds=600)
    try:
        return ops.create_email_verification(email, purpose=req.purpose)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/auth/email/verify-code")
async def verify_email_code(
    req: EmailVerifyCodeRequest,
    request: Request,
    ops: OpsStore = Depends(get_ops_store),
):
    rate_limit(
        f"auth:email-verify:{client_ip(request) or 'unknown'}",
        limit=20,
        window_seconds=60,
    )
    try:
        return ops.verify_email_code(req.challenge_id, req.code)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/auth/invite/preview")
async def preview_invite(
    token: str,
    request: Request,
    ops: OpsStore = Depends(get_ops_store),
    store: UserStore = Depends(get_user_store),
):
    """Resolve invite token → email for the Accept Invite UI (no consumption)."""
    rate_limit(
        f"auth:invite-preview:{client_ip(request) or 'unknown'}",
        limit=30,
        window_seconds=60,
    )
    try:
        peeked = ops.peek_invite_token(token, purpose="invite")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    email = peeked["email"]
    record = store.get_user(email)
    status = (
        normalize_account_status(
            record.get("account_status"), is_active=bool(record.get("is_active"))
        )
        if record
        else None
    )
    if not record or status != ACCOUNT_INVITED:
        raise HTTPException(404, "invite_not_found")
    local, _, domain = email.partition("@")
    hint = f"{local[:1]}***@{domain}" if domain else "***"
    return {
        "email": email,
        "email_hint": hint,
        "display_name": record.get("display_name") or local,
        "org_id": peeked.get("org_id") or "",
    }


@router.post("/auth/invite/resend-code")
async def resend_invite_code(
    req: InviteResendRequest,
    request: Request,
    store: UserStore = Depends(get_user_store),
    orgs: OrgStore = Depends(get_org_store),
    ops: OpsStore = Depends(get_ops_store),
):
    from src.auth_provision import issue_invite_activation_email

    ip = client_ip(request) or "unknown"
    rate_limit(f"auth:invite-resend:{ip}", limit=8, window_seconds=60)
    email = (req.email or "").strip().lower()
    raw_token = (req.token or "").strip()
    if raw_token and not email:
        try:
            email = ops.peek_invite_token(raw_token, purpose="invite")["email"]
        except ValueError:
            return {"ok": True}
    if not email:
        return {"ok": True}
    rate_limit(f"auth:invite-resend-addr:{email}", limit=5, window_seconds=600)
    record = store.get_user(email)
    status = (
        normalize_account_status(
            record.get("account_status"), is_active=bool(record.get("is_active"))
        )
        if record
        else None
    )
    if not record or status != ACCOUNT_INVITED:
        # Do not leak whether the invite exists.
        return {"ok": True}
    membership = orgs.membership_for(email)
    company = ""
    org_id = None
    if membership:
        org = orgs.get_org(membership["org_id"])
        company = (org or {}).get("name") or ""
        org_id = membership["org_id"]
    kind = "owner_invite" if membership and membership.get("role") == "owner" else "team_invite"
    activation = issue_invite_activation_email(
        email=email,
        display_name=record.get("display_name") or email.split("@")[0],
        company_name=company or "your company",
        email_kind=kind,
        org_id=org_id,
    )
    payload = {"ok": True, "challenge_id": activation.get("challenge_id"), "email": email}
    if activation.get("debug_code"):
        payload["debug_code"] = activation["debug_code"]
    if activation.get("debug_invite_token"):
        payload["debug_invite_token"] = activation["debug_invite_token"]
    return payload


@router.post("/auth/invite/activate")
async def activate_invite(
    req: InviteActivateRequest,
    request: Request,
    store: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
    orgs: OrgStore = Depends(get_org_store),
):
    """Invited users only — not gated by active-session rules.

    Requires: valid unused token + matching OTP + password, with email/org
    binding checks. Consumes token+OTP then sets ACTIVE (fail closed on mismatch).
    """
    rate_limit(
        f"auth:invite-activate:{client_ip(request) or 'unknown'}",
        limit=20,
        window_seconds=60,
    )
    optional_email = (req.email or "").strip().lower() or None
    optional_org = (req.org_id or "").strip() or None
    try:
        peeked = ops.peek_invite_token(
            req.token,
            purpose="invite",
            email=optional_email,
            org_id=optional_org,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    email = peeked["email"]
    bound_org = (peeked.get("org_id") or "").strip()
    record = store.get_user(email)
    if not record:
        raise HTTPException(404, "invite_not_found")
    status = normalize_account_status(
        record.get("account_status"), is_active=bool(record.get("is_active"))
    )
    if status == ACCOUNT_ACTIVE:
        raise HTTPException(409, "invite_already_activated")
    if status != ACCOUNT_INVITED:
        raise HTTPException(403, account_auth_error(status))

    membership = orgs.membership_for(email)
    member_org = str((membership or {}).get("org_id") or "").strip()
    if bound_org:
        if not member_org or member_org != bound_org:
            raise HTTPException(400, "invite_org_mismatch")
        if optional_org and optional_org != bound_org:
            raise HTTPException(400, "invite_org_mismatch")

    try:
        proof = (req.email_verification_token or "").strip()
        if not proof:
            if req.challenge_id and req.code:
                verified = ops.verify_email_code(req.challenge_id, req.code)
            elif req.code:
                verified = ops.verify_email_code_for_address(
                    email, req.code, purpose="invite"
                )
            else:
                raise ValueError("email_verification_required")
            if str(verified.get("email") or "").strip().lower() != email:
                raise ValueError("invite_email_mismatch")
            proof = verified["verification_token"]
        # Consume credentials then activate — order minimizes half-done sessions.
        ops.consume_email_verification(
            email=email,
            purpose="invite",
            verification_token=proof,
        )
        ops.consume_invite_token(
            req.token,
            purpose="invite",
            email=email,
            org_id=bound_org or None,
        )
        store.update_user(
            email,
            password=req.password,
            account_status=ACCOUNT_ACTIVE,
            is_active=True,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    if use_supabase_auth():
        try:
            uid = ensure_auth_user(email, req.password)
            if uid:
                store.set_supabase_user_id(email, uid)
        except RuntimeError as exc:
            raise HTTPException(502, "supabase_sync_failed") from exc
    return {
        "ok": True,
        "username": email,
        "message": "invite_activated",
    }


@router.post("/auth/forgot-password")
async def forgot_password(
    req: ForgotPasswordRequest,
    request: Request,
    store: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
):
    rate_limit(
        f"auth:forgot:{client_ip(request) or 'unknown'}",
        limit=5,
        window_seconds=60,
    )
    username = req.username.strip()
    record = store.find_user(username)
    token = None
    if record:
        token = ops.create_password_reset(record["username"])
    expose_token = (
        token if record and not use_supabase_auth() and expose_security_debug() else None
    )
    return {"ok": True, "reset_token": expose_token}


@router.post("/auth/reset-password")
async def reset_password(
    req: ResetPasswordRequest,
    request: Request,
    store: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
):
    rate_limit(
        f"auth:reset:{client_ip(request) or 'unknown'}",
        limit=10,
        window_seconds=60,
    )
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
    orgs: OrgStore = Depends(get_org_store),
    ops: OpsStore = Depends(get_ops_store),
):
    if user.username.startswith("apikey:"):
        timeout = int(ops.get_security().get("session_timeout_minutes") or 30)
        return {
            "user": {
                "username": user.username,
                "display_name": user.display_name,
                "role": user.role,
                "features": user.features,
                "token_limit": 0,
                "used_tokens": 0,
                "percent_remaining": 100.0,
            },
            "session_timeout_minutes": timeout,
            "auth_via": "api_key",
        }
    record = store.get_user(user.username)
    if not record:
        raise HTTPException(401, "unknown_user")
    # Soft-repair legacy 1M caps: rebalance remaining pool across the org once.
    try:
        membership = orgs.membership_for(user.username)
        if membership and int(record.get("token_limit") or 0) == 1_000_000:
            from src.org_token_pool import rebalance_equal_remaining

            rebalance_equal_remaining(
                str(membership["org_id"]), orgs=orgs, users=store
            )
            record = store.get_user(user.username) or record
    except Exception:
        pass
    usage = store.get_billing_summary(user.username)
    timeout = int(ops.get_security().get("session_timeout_minutes") or 30)
    return {
        "user": _user_payload(record, usage),
        "session_timeout_minutes": timeout,
    }


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
