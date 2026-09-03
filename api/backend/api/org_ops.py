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


@router.get("/org/invoices/{invoice_id}")
async def get_org_invoice(
    invoice_id: str,
    org: OrgContext = Depends(require_org_owner),
    ops: OpsStore = Depends(get_ops_store),
):
    invoice = ops.get_invoice(invoice_id)
    if not invoice or invoice.get("company_id") != org.org_id:
        raise HTTPException(404, "invoice_not_found")
    return invoice


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
                    "credit_username": "",
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
    credit_username = (meta.get("credit_username") or "").strip() or None
    token_request_id = (meta.get("token_request_id") or "").strip() or None
    if session["amount_total"]:
        amount = session["amount_total"] / 100.0
    try:
        invoice = fulfill_purchase(
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
            credit_username=credit_username,
            commerce=commerce,
            orgs=orgs,
            users=users,
            ops=ops,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    if token_request_id and kind == "tokens":
        req_row = ops.get_member_token_request(token_request_id)
        if (
            req_row
            and req_row.get("org_id") == org.org_id
            and req_row.get("status") == "pending"
        ):
            ops.resolve_member_token_request(
                token_request_id,
                "approved",
                user.username,
                fulfill_mode="purchase",
                purchase_session_id=session["id"],
            )
            try:
                send_coair_email(
                    "token_request_resolved",
                    req_row["username"],
                    name=req_row["username"],
                    company_name=org.name,
                    description=(
                        f"Approved: {req_row['tokens']} tokens purchased for you."
                    ),
                )
            except Exception:
                pass
    return invoice


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
    from src.org_token_pool import rebalance_equal_remaining

    package_storage = int(org.policy.get("default_storage_bytes") or 0)
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
            token_limit=0,
        )
        try:
            users.billing.update_account(email, storage_limit_bytes=package_storage)
        except Exception:
            pass
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
                token_limit=0,
                plan_type=org.policy.get("default_plan_type", "demo"),
                initial_credits=org.policy.get("default_credits", 0),
                storage_limit_bytes=package_storage,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        try:
            orgs.add_member(org.org_id, email, "member")
        except ValueError as exc:
            users.delete_user(email, soft=False)
            raise HTTPException(409, str(exc)) from exc
    rebalance_equal_remaining(org.org_id, orgs=orgs, users=users)
    record = users.get_user(email) or record
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


class MemberTokenRequestBody(BaseModel):
    tokens: int = Field(ge=1)
    reason: str = Field(default="", max_length=400)


class ApproveMemberTokenRequestBody(BaseModel):
    mode: Literal["transfer", "purchase"]
    from_username: Optional[str] = Field(default=None, max_length=160)
    tokens: Optional[int] = Field(default=None, ge=1)
    amount_usd: float = Field(default=0, ge=0)


@router.get("/org/token-pool")
async def get_org_token_pool(
    org: OrgContext = Depends(require_org),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
):
    from src.org_token_pool import pool_snapshot

    return pool_snapshot(org.org_id, orgs=orgs, users=users)


@router.get("/org/token-requests")
async def list_member_token_requests(
    org: OrgContext = Depends(require_org),
    user: UserContext = Depends(get_current_user),
    ops: OpsStore = Depends(get_ops_store),
):
    if org.role == "owner" or org.is_platform:
        return {
            "requests": ops.list_member_token_requests(org_id=org.org_id),
        }
    return {
        "requests": ops.list_member_token_requests(
            org_id=org.org_id, username=user.username
        ),
    }


@router.post("/org/token-requests", status_code=201)
async def create_member_token_request(
    req: MemberTokenRequestBody,
    org: OrgContext = Depends(require_org),
    user: UserContext = Depends(get_current_user),
    ops: OpsStore = Depends(get_ops_store),
    users: UserStore = Depends(get_user_store),
):
    try:
        request = ops.create_member_token_request(
            org_id=org.org_id,
            username=user.username,
            tokens=req.tokens,
            reason=req.reason,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    ops.record_audit(
        actor=user.username,
        action="tokens.member_request",
        target_type="token_request",
        target_id=request["id"],
        target_label=request["id"],
        detail=f"Requested {req.tokens} tokens from company pool",
    )

    # Notify company owner(s)
    try:
        owners = [
            m["username"]
            for m in get_org_store().list_members(org.org_id)
            if m.get("role") == "owner"
        ]
        requester = users.get_user(user.username) or {}
        for owner_name in owners:
            if owner_name.lower() == user.username.lower():
                continue
            send_coair_email(
                "token_request",
                owner_name,
                name=owner_name,
                company_name=org.name,
                description=(
                    f"{requester.get('display_name') or user.username} "
                    f"requested {req.tokens} tokens"
                    + (f": {req.reason}" if req.reason.strip() else ".")
                ),
            )
    except Exception:
        pass
    return request


@router.post("/org/token-requests/{request_id}/approve")
async def approve_member_token_request(
    request_id: str,
    req: ApproveMemberTokenRequestBody,
    org: OrgContext = Depends(require_org_owner),
    user: UserContext = Depends(get_current_user),
    ops: OpsStore = Depends(get_ops_store),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
    commerce: CommerceStore = Depends(get_commerce_store),
):
    current = ops.get_member_token_request(request_id)
    if not current or current.get("org_id") != org.org_id:
        raise HTTPException(404, "token_request_not_found")
    if current["status"] != "pending":
        raise HTTPException(409, "token_request_already_resolved")

    tokens = int(req.tokens or current["tokens"])
    if tokens < 1:
        raise HTTPException(400, "tokens_required")

    if req.mode == "transfer":
        donor = (req.from_username or "").strip()
        if not donor:
            raise HTTPException(400, "from_username_required")
        from src.org_token_pool import transfer_unused

        try:
            transfer = transfer_unused(
                org.org_id,
                donor,
                current["username"],
                tokens,
                orgs=orgs,
                users=users,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

        updated = ops.resolve_member_token_request(
            request_id,
            "approved",
            user.username,
            fulfill_mode="transfer",
            donor_username=donor,
        )
        ops.record_audit(
            actor=user.username,
            action="tokens.member_request_approve",
            target_type="token_request",
            target_id=request_id,
            target_label=request_id,
            detail=(
                f"Transferred {transfer['tokens']} from {donor} "
                f"to {current['username']}"
            ),
        )
        try:
            send_coair_email(
                "token_request_resolved",
                current["username"],
                name=current["username"],
                company_name=org.name,
                description=(
                    f"Approved: {transfer['tokens']} tokens transferred to you."
                ),
            )
        except Exception:
            pass
        return {"request": updated, "transfer": transfer}

    # purchase mode
    description = f"Token pack {tokens} for {current['username']}"
    amount = float(req.amount_usd)
    if stripe_enabled() and amount > 0:
        try:
            session = create_checkout_session(
                org_id=org.org_id,
                amount_usd=amount,
                description=description,
                success_path="/company/team?session_id={CHECKOUT_SESSION_ID}",
                cancel_path="/company/team?cancelled=1",
                metadata={
                    "flow": "billing",
                    "kind": "tokens",
                    "plan_id": "",
                    "tokens": str(tokens),
                    "gb": "",
                    "module_id": "",
                    "description": description[:200],
                    "amount_usd": str(amount),
                    "credit_username": current["username"],
                    "token_request_id": request_id,
                },
            )
        except Exception as exc:
            raise HTTPException(502, f"stripe_session_failed:{exc}") from exc
        return {"checkout": session, "request": current}

    try:
        invoice = fulfill_purchase(
            org.org_id,
            kind="tokens",
            actor=user.username,
            amount_usd=amount,
            tokens=tokens,
            description=description,
            credit_username=current["username"],
            commerce=commerce,
            orgs=orgs,
            users=users,
            ops=ops,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    updated = ops.resolve_member_token_request(
        request_id,
        "approved",
        user.username,
        fulfill_mode="purchase",
    )
    ops.record_audit(
        actor=user.username,
        action="tokens.member_request_approve",
        target_type="token_request",
        target_id=request_id,
        target_label=request_id,
        detail=f"Purchased {tokens} tokens for {current['username']}",
    )
    try:
        send_coair_email(
            "token_request_resolved",
            current["username"],
            name=current["username"],
            company_name=org.name,
            description=f"Approved: {tokens} tokens purchased for you.",
        )
    except Exception:
        pass
    return {"request": updated, "invoice": invoice}


@router.post("/org/token-requests/{request_id}/deny")
async def deny_member_token_request(
    request_id: str,
    org: OrgContext = Depends(require_org_owner),
    user: UserContext = Depends(get_current_user),
    ops: OpsStore = Depends(get_ops_store),
):
    current = ops.get_member_token_request(request_id)
    if not current or current.get("org_id") != org.org_id:
        raise HTTPException(404, "token_request_not_found")
    if current["status"] != "pending":
        raise HTTPException(409, "token_request_already_resolved")
    try:
        updated = ops.resolve_member_token_request(
            request_id, "denied", user.username
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    ops.record_audit(
        actor=user.username,
        action="tokens.member_request_deny",
        target_type="token_request",
        target_id=request_id,
        target_label=request_id,
        detail=f"Denied token request from {current['username']}",
    )
    try:
        send_coair_email(
            "token_request_resolved",
            current["username"],
            name=current["username"],
            company_name=org.name,
            description="Your token request was denied.",
        )
    except Exception:
        pass
    return updated
