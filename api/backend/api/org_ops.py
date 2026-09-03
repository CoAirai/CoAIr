"""Company invoices, purchases, and email invites."""

from __future__ import annotations

import secrets
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.orgs import OrgContext, require_org, require_org_owner
from backend.core.security import UserContext, get_current_user
from src.commerce_store import CommerceStore, get_commerce_store
from src.ops_store import OpsStore, get_ops_store
from src.org_store import OrgStore, get_org_store
from src.email_delivery import send_coair_email
from src.stripe_billing import (
    create_checkout_session,
    fulfill_purchase,
    retrieve_paid_session,
    stripe_enabled,
)
from src.supabase_auth import invite_or_recover, use_supabase_auth
from src.user_store import UserStore, get_user_store


router = APIRouter()


class InviteRequest(BaseModel):
    email: str = Field(min_length=3, max_length=160)
    display_name: Optional[str] = Field(default=None, max_length=160)


class PurchaseRequest(BaseModel):
    kind: Literal["tokens", "storage", "upgrade", "addon"]
    amount_usd: float = Field(default=0, ge=0)
    tokens: Optional[int] = Field(default=None, ge=1)
    gb: Optional[int] = Field(default=None, ge=1)
    plan_id: Optional[Literal["demo", "foundation", "pro", "enterprise", "custom"]] = None
    module_id: Optional[Literal["chatbot", "chronology", "forensic"]] = None
    description: str = Field(default="", max_length=200)


class ConfirmPurchaseRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=200)


class TopupRequestBody(BaseModel):
    tokens: int = Field(ge=1)
    amount_usd: float = Field(default=0, ge=0)
    reason: str = Field(min_length=3, max_length=400)


@router.get("/org/invoices")
async def list_org_invoices(
    org: OrgContext = Depends(require_org_owner),
    ops: OpsStore = Depends(get_ops_store),
):
    return {"invoices": ops.list_invoices(org.org_id)}


def _purchase_amount_and_label(
    req: PurchaseRequest,
    commerce: CommerceStore,
) -> tuple[float, str]:
    description = req.description.strip()
    amount = float(req.amount_usd)
    if req.kind == "upgrade":
        if not req.plan_id:
            raise HTTPException(400, "plan_id_required")
        plan = commerce.get_plan(req.plan_id)
        if not plan:
            raise HTTPException(404, "plan_not_found")
        amount = amount or float(plan["api_credits_usd"])
        description = description or f"Upgrade to {plan['name']}"
    elif req.kind == "storage":
        if not req.gb:
            raise HTTPException(400, "gb_required")
        # Prefer client amount_usd; otherwise $1 per GB for custom sizes.
        amount = amount or float(req.gb)
        description = description or f"Storage +{req.gb} GB"
    elif req.kind == "tokens":
        if not req.tokens:
            raise HTTPException(400, "tokens_required")
        description = description or f"Token pack {req.tokens}"
    else:
        description = description or f"Add-on {req.module_id or ''}".strip()
        amount = amount or 50
    return amount, description


@router.post("/org/purchases", status_code=201)
async def create_purchase(
    req: PurchaseRequest,
    org: OrgContext = Depends(require_org_owner),
    user: UserContext = Depends(get_current_user),
    ops: OpsStore = Depends(get_ops_store),
    commerce: CommerceStore = Depends(get_commerce_store),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
):
    amount, description = _purchase_amount_and_label(req, commerce)

    if stripe_enabled():
        if amount <= 0:
            return fulfill_purchase(
                org.org_id,
                kind=req.kind,
                actor=user.username,
                amount_usd=amount,
                tokens=req.tokens,
                gb=req.gb,
                plan_id=req.plan_id,
                module_id=req.module_id,
                description=description,
                commerce=commerce,
                orgs=orgs,
                users=users,
                ops=ops,
            )
        try:
            session = create_checkout_session(
                org_id=org.org_id,
                amount_usd=amount,
                description=description,
                success_path="/company/billing?session_id={CHECKOUT_SESSION_ID}",
                cancel_path="/company/billing?cancelled=1",
                metadata={
                    "flow": "billing",
                    "kind": req.kind,
                    "plan_id": req.plan_id or "",
                    "tokens": str(req.tokens or ""),
                    "gb": str(req.gb or ""),
                    "module_id": req.module_id or "",
                    "description": description[:200],
                    "amount_usd": str(amount),
                },
            )
        except Exception as exc:
            raise HTTPException(502, f"stripe_session_failed:{exc}") from exc
        return session

    return fulfill_purchase(
        org.org_id,
        kind=req.kind,
        actor=user.username,
        amount_usd=amount,
        tokens=req.tokens,
        gb=req.gb,
        plan_id=req.plan_id,
        module_id=req.module_id,
        description=description,
        commerce=commerce,
        orgs=orgs,
        users=users,
        ops=ops,
    )


@router.post("/org/purchases/confirm")
async def confirm_purchase(
    req: ConfirmPurchaseRequest,
    org: OrgContext = Depends(require_org_owner),
    user: UserContext = Depends(get_current_user),
    ops: OpsStore = Depends(get_ops_store),
    commerce: CommerceStore = Depends(get_commerce_store),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
):
    if not stripe_enabled():
        raise HTTPException(400, "stripe_not_configured")
    try:
        session = retrieve_paid_session(req.session_id.strip())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"stripe_retrieve_failed:{exc}") from exc

    if session["org_id"] and session["org_id"] != org.org_id:
        raise HTTPException(403, "session_org_mismatch")
    meta = session["metadata"]
    kind = meta.get("kind") or ""
    if kind not in ("tokens", "storage", "upgrade", "addon"):
        raise HTTPException(400, "session_not_purchase")
    tokens = int(meta["tokens"]) if meta.get("tokens") else None
    gb = int(meta["gb"]) if meta.get("gb") else None
    plan_id = meta.get("plan_id") or None
    module_id = meta.get("module_id") or None
    amount = float(meta.get("amount_usd") or 0)
    if session["amount_total"]:
        amount = session["amount_total"] / 100.0
    try:
        return fulfill_purchase(
            org.org_id,
            kind=kind,
            actor=user.username,
            amount_usd=amount,
            tokens=tokens,
            gb=gb,
            plan_id=plan_id,
            module_id=module_id,
            description=meta.get("description") or "",
            stripe_session_id=session["id"],
            commerce=commerce,
            orgs=orgs,
            users=users,
            ops=ops,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/org/invites", status_code=201)
async def invite_org_user(
    req: InviteRequest,
    org: OrgContext = Depends(require_org_owner),
    actor: UserContext = Depends(get_current_user),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
):
    email = req.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "invalid_email")
    existing = users.get_user(email)
    if existing:
        if existing.get("is_active", True):
            raise HTTPException(409, "email_already_registered")
        password = secrets.token_urlsafe(12)
        users.update_user(
            email,
            password=password,
            display_name=req.display_name or existing.get("display_name"),
            is_active=True,
        )
        record = users.get_user(email) or existing
        membership = orgs.membership_for(email)
        if not membership or membership["org_id"] != org.org_id:
            try:
                orgs.add_member(org.org_id, email, "member")
            except ValueError as exc:
                raise HTTPException(409, str(exc)) from exc
    else:
        password = secrets.token_urlsafe(12)
        try:
            record = users.create_user(
                username=email,
                password=password,
                display_name=req.display_name or email.split("@")[0],
                role="user",
                token_limit=org.policy.get("default_token_limit", 1_000_000),
                plan_type=org.policy.get("default_plan_type", "demo"),
                initial_credits=org.policy.get("default_credits", 0),
                storage_limit_bytes=org.policy.get("default_storage_bytes", 0),
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        try:
            orgs.add_member(org.org_id, email, "member")
        except ValueError as exc:
            users.delete_user(email, soft=False)
            raise HTTPException(409, str(exc)) from exc
    invited = False
    emailed = False
    if use_supabase_auth():
        try:
            uid = invite_or_recover(email, email, password=password)
            if uid:
                users.set_supabase_user_id(email, uid)
            invited = True
        except RuntimeError as exc:
            if not existing:
                users.delete_user(email, soft=False)
            raise HTTPException(502, "supabase_sync_failed") from exc
    mail = send_coair_email(
        "team_invite",
        email,
        name=record["display_name"],
        company_name=org.name,
        temporary_password=password,
    )
    emailed = mail.get("ok") and mail.get("mode") == "live"
    ops.queue_email(
        kind="team_invite",
        recipient=email,
        subject="You are invited to COAir",
        body=f"Team invite sent via Resend ({mail.get('mode', 'unknown')})",
        secret=None if emailed else password,
    )
    ops.record_audit(
        actor=actor.username,
        action="user.invite",
        target_type="user",
        target_id=email,
        target_label=email,
        detail=f"Invited {email} to {org.name}",
    )
    return {
        "username": record["username"],
        "display_name": record["display_name"],
        "invited": invited or emailed,
        "email_sent": emailed,
        "email_error": None if emailed else mail.get("error"),
        "temporary_password": "" if emailed else password,
    }


@router.get("/org/platform-status")
async def platform_status(
    _user: UserContext = Depends(get_current_user),
    ops: OpsStore = Depends(get_ops_store),
):
    maintenance = ops.get_maintenance()
    return {
        "maintenance_mode": maintenance["mode"],
        "maintenance_message": maintenance["message"],
        "flags": ops.flag_map(),
        "announcements": ops.list_announcements(status="published"),
    }


@router.get("/org/topups")
async def list_org_topups(
    org: OrgContext = Depends(require_org),
    ops: OpsStore = Depends(get_ops_store),
):
    return {"requests": ops.list_topups(org_id=org.org_id)}


@router.post("/org/topups", status_code=201)
async def create_org_topup(
    req: TopupRequestBody,
    org: OrgContext = Depends(require_org_owner),
    user: UserContext = Depends(get_current_user),
    ops: OpsStore = Depends(get_ops_store),
):
    if not ops.flag_map().get("topups"):
        raise HTTPException(403, "feature_not_available:topups")
    request = ops.create_topup(
        org_id=org.org_id,
        username=user.username,
        tokens=req.tokens,
        amount_usd=req.amount_usd,
        reason=req.reason,
    )
    ops.record_audit(
        actor=user.username,
        action="tokens.topup_request",
        target_type="topup",
        target_id=request["id"],
        target_label=request["id"],
        detail=f"Requested {req.tokens} tokens (${req.amount_usd:.2f})",
    )
    return request
