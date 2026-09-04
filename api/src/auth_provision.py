"""Create app users from real emails and bootstrap the first superadmin."""
from __future__ import annotations

import os
import secrets
from typing import Any, Dict, Literal, Optional

from src.commerce_store import resolve_user_provision_limits
from src.email_delivery import send_coair_email
from src.ops_store import OpsStore, get_ops_store
from src.supabase_auth import invite_or_recover, use_supabase_auth
from src.user_store import SUPERADMIN_ROLE, UserStore

EmailKind = Literal["owner_invite", "team_invite"]


def superadmin_emails() -> set[str]:
    raw = os.getenv("SUPERADMIN_EMAIL", "")
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def is_bootstrap_superadmin(email: str, username: str = "") -> bool:
    allowed = superadmin_emails()
    if not allowed:
        return False
    return email.strip().lower() in allowed or username.strip().lower() in allowed


def issue_invite_activation_email(
    *,
    email: str,
    display_name: str,
    company_name: str,
    email_kind: EmailKind,
    ops: OpsStore | None = None,
) -> Dict[str, Any]:
    """Create an invite email-OTP challenge and send it inside the invite mail."""
    store = ops or get_ops_store()
    challenge = store.create_email_verification(
        email, purpose="invite", send_email=False
    )
    code = str(challenge.get("code") or challenge.get("debug_code") or "")
    result = send_coair_email(
        email_kind,
        email,
        name=display_name,
        company_name=company_name or "your company",
        mfa_code=code,
    )
    store.queue_email(
        kind=email_kind,
        recipient=email,
        subject=f"Activate your COAir invite ({email_kind})",
        body=f"Invite activation queued ({result.get('mode', 'unknown')})",
        secret=code if not (result.get("ok") and result.get("mode") == "live") else None,
    )
    emailed = bool(result.get("ok") and result.get("mode") == "live")
    return {
        "challenge_id": challenge["challenge_id"],
        "emailed": emailed,
        "debug_code": challenge.get("debug_code"),
        "email_error": None if emailed else result.get("error"),
    }


def provision_invited_user(
    store: UserStore,
    email: str,
    *,
    display_name: Optional[str] = None,
    role: str = "user",
    token_limit: int = 1_000_000,
    features: Optional[Dict[str, bool]] = None,
    plan_type: str = "demo",
    initial_credits: float | None = None,
    storage_limit_bytes: int | None = None,
    password: str = "",
    company_name: str = "",
    email_kind: EmailKind = "owner_invite",
    send_welcome_email: bool = True,
    require_email_activation: bool = True,
) -> Dict[str, Any]:
    """Create a local row, sync Supabase auth, and require email OTP before login."""
    username = email.strip().lower()
    if "@" not in username:
        raise ValueError("invalid_email")
    existing = store.find_user(username)
    operator = role in ("admin", SUPERADMIN_ROLE)
    limits = resolve_user_provision_limits(
        "legacy" if operator else plan_type,
        initial_credits=initial_credits,
        storage_limit_bytes=storage_limit_bytes,
    )
    if existing:
        if use_supabase_auth():
            uid = invite_or_recover(username, existing["username"])
            if uid:
                store.set_supabase_user_id(existing["username"], uid)
        if not operator and store.billing.get_account(existing["username"]):
            store.billing.update_account(
                existing["username"],
                plan_type=plan_type,
                storage_limit_bytes=limits["storage_limit_bytes"],
            )
        if (
            send_welcome_email
            and not operator
            and require_email_activation
            and not existing.get("is_active", True)
        ):
            issue_invite_activation_email(
                email=username,
                display_name=existing.get("display_name") or username.split("@")[0],
                company_name=company_name,
                email_kind=email_kind,
            )
        return existing
    chosen_password = password or secrets.token_urlsafe(18)
    credits = limits["initial_credits"]
    storage = limits["storage_limit_bytes"]
    active = False if (require_email_activation and not operator) else True
    record = store.create_user(
        username=username,
        password=chosen_password,
        display_name=display_name or username.split("@")[0],
        role=role,
        token_limit=token_limit,
        features=features,
        plan_type="legacy" if operator else plan_type,
        initial_credits=0 if operator else credits,
        storage_limit_bytes=0 if operator else storage,
        model_policy="" if operator else "demo-tiered-quality-v2",
        is_active=active,
    )
    if use_supabase_auth():
        uid = invite_or_recover(username, username, password=chosen_password)
        if uid:
            store.set_supabase_user_id(username, uid)
    if send_welcome_email and not operator and require_email_activation:
        issue_invite_activation_email(
            email=username,
            display_name=record["display_name"],
            company_name=company_name or "your company",
            email_kind=email_kind,
        )
    elif send_welcome_email and not operator:
        send_coair_email(
            email_kind,
            username,
            name=record["display_name"],
            company_name=company_name or "your company",
            temporary_password=chosen_password,
        )
    return store.get_user(username) or record


def maybe_bootstrap_superadmin(
    store: UserStore,
    payload: Dict[str, Any],
    supabase_user_id: str = "",
) -> Optional[Dict[str, Any]]:
    """If this Auth user is the configured platform owner, create the app row."""
    email = str(payload.get("email") or "").strip().lower()
    meta = payload.get("user_metadata") or {}
    username = ""
    if isinstance(meta, dict):
        username = str(meta.get("username") or "").strip()
    if not is_bootstrap_superadmin(email, username):
        return None
    ident = email or username.lower()
    existing = store.find_user(ident)
    if existing:
        if existing["role"] != SUPERADMIN_ROLE:
            store.update_user(existing["username"], role=SUPERADMIN_ROLE)
            existing = store.get_user(existing["username"]) or existing
        if supabase_user_id:
            store.set_supabase_user_id(existing["username"], supabase_user_id)
        return existing
    record = store.create_user(
        username=ident,
        password=secrets.token_urlsafe(24),
        display_name=(ident.split("@")[0] if "@" in ident else ident),
        role=SUPERADMIN_ROLE,
        plan_type="legacy",
        initial_credits=0,
        storage_limit_bytes=0,
        model_policy="",
        is_active=True,
    )
    if supabase_user_id:
        store.set_supabase_user_id(record["username"], supabase_user_id)
    return store.get_user(record["username"]) or record
