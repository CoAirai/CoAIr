"""Authenticated catalog and owner checkout for COAir packages."""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.orgs import OrgContext, require_org_owner
from backend.core.security import UserContext, get_current_user
from src.commerce_store import CommerceStore, get_commerce_store
from src.ops_store import OpsStore, get_ops_store
from src.org_store import OrgStore, get_org_store
from src.pricing import resolve_charge
from src.stripe_billing import (
    cancel_package_subscription,
    create_plan_subscription_checkout,
    fulfill_plan,
    resume_package_subscription,
    retrieve_paid_session,
    stripe_enabled,
    _period_end_iso,
    _stripe,
)
from src.user_store import UserStore, get_user_store


router = APIRouter()


class CheckoutRequest(BaseModel):
    plan_id: Literal["demo", "foundation", "pro", "enterprise", "custom"]
    coupon_code: Optional[str] = Field(default=None, max_length=64)


class ConfirmCheckoutRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=200)


class CancelSubscriptionRequest(BaseModel):
    immediate: bool = False


class PricingPreviewRequest(BaseModel):
    amount_usd: float = Field(ge=0)
    coupon_code: Optional[str] = Field(default=None, max_length=64)


def _pricing_http_error(exc: ValueError) -> HTTPException:
    code = str(exc)
    if code in ("coupon_not_found", "coupon_inactive", "coupon_code_required"):
        return HTTPException(400, code)
    return HTTPException(400, code)


@router.get("/packages")
async def list_packages(
    user: UserContext = Depends(get_current_user),
    store: CommerceStore = Depends(get_commerce_store),
):
    plans = store.list_plans()
    # Custom is Super-Admin–assigned only — hide from company self-serve catalogs.
    if user.role not in ("admin", "superadmin"):
        plans = [plan for plan in plans if plan.get("id") != "custom"]
    return {"plans": plans}


@router.get("/org/tax")
async def read_org_tax(
    _org: OrgContext = Depends(require_org_owner),
    ops: OpsStore = Depends(get_ops_store),
):
    tax = ops.get_tax()
    return {
        "percent": float(tax["percent"]),
        "region_label": tax["region_label"],
    }


@router.post("/org/pricing/preview")
async def preview_pricing(
    req: PricingPreviewRequest,
    _org: OrgContext = Depends(require_org_owner),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        priced = resolve_charge(
            ops, req.amount_usd, coupon_code=req.coupon_code
        )
    except ValueError as exc:
        raise _pricing_http_error(exc) from exc
    return priced["pricing"]


@router.post("/org/checkout")
async def checkout_plan(
    req: CheckoutRequest,
    org: OrgContext = Depends(require_org_owner),
    commerce: CommerceStore = Depends(get_commerce_store),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
    actor: UserContext = Depends(get_current_user),
):
    plan = commerce.get_plan(req.plan_id)
    if not plan:
        raise HTTPException(404, "plan_not_found")

    base = float(plan["api_credits_usd"])
    try:
        priced = resolve_charge(ops, base, coupon_code=req.coupon_code)
    except ValueError as exc:
        raise _pricing_http_error(exc) from exc

    description = f"{plan['name']} package (monthly){priced['description_suffix']}"
    amount = float(priced["total_usd"])

    if stripe_enabled():
        if amount <= 0:
            return fulfill_plan(
                org.org_id,
                req.plan_id,
                actor.username,
                amount_usd=0,
                invoice_description=description,
                commerce=commerce,
                orgs=orgs,
                users=users,
                ops=ops,
            )
        try:
            session = create_plan_subscription_checkout(
                org_id=org.org_id,
                amount_usd=amount,
                description=description,
                plan_id=req.plan_id,
                success_path="/onboarding/checkout?session_id={CHECKOUT_SESSION_ID}",
                cancel_path=f"/onboarding/checkout?plan={req.plan_id}&cancelled=1",
                flow="checkout",
                extra_metadata={
                    "base_usd": priced["base_usd"],
                    "discount_usd": priced["discount_usd"],
                    "tax_usd": priced["tax_usd"],
                    "tax_percent": priced["tax_percent"],
                    "coupon_code": priced["coupon_code"],
                },
            )
        except Exception as exc:
            raise HTTPException(502, f"stripe_session_failed:{exc}") from exc
        return {**session, "pricing": priced["pricing"]}

    return fulfill_plan(
        org.org_id,
        req.plan_id,
        actor.username,
        amount_usd=amount,
        invoice_description=description,
        commerce=commerce,
        orgs=orgs,
        users=users,
        ops=ops,
    )


@router.post("/org/checkout/confirm")
async def confirm_checkout(
    req: ConfirmCheckoutRequest,
    org: OrgContext = Depends(require_org_owner),
    commerce: CommerceStore = Depends(get_commerce_store),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
    ops: OpsStore = Depends(get_ops_store),
    actor: UserContext = Depends(get_current_user),
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
    kind = meta.get("kind") or "plan"
    if kind != "plan":
        raise HTTPException(400, "session_not_plan_checkout")
    plan_id = meta.get("plan_id")
    if not plan_id:
        raise HTTPException(400, "session_missing_plan")

    period_end = None
    sub_id = session.get("subscription_id") or ""
    if sub_id:
        try:
            sub = _stripe().Subscription.retrieve(sub_id)
            ts = getattr(sub, "current_period_end", None)
            if ts:
                period_end = _period_end_iso(from_ts=int(ts))
        except Exception:
            period_end = None

    charged = None
    if session.get("amount_total"):
        charged = float(session["amount_total"]) / 100.0
    elif meta.get("amount_usd"):
        charged = float(meta["amount_usd"])
    description = meta.get("description") or None

    try:
        return fulfill_plan(
            org.org_id,
            plan_id,
            actor.username,
            stripe_session_id=session["id"],
            stripe_customer_id=session.get("customer_id") or "",
            stripe_subscription_id=sub_id,
            current_period_end=period_end,
            amount_usd=charged,
            invoice_description=description,
            commerce=commerce,
            orgs=orgs,
            users=users,
            ops=ops,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/org/subscription/cancel")
async def cancel_subscription(
    req: CancelSubscriptionRequest,
    org: OrgContext = Depends(require_org_owner),
    actor: UserContext = Depends(get_current_user),
    commerce: CommerceStore = Depends(get_commerce_store),
    orgs: OrgStore = Depends(get_org_store),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        return cancel_package_subscription(
            org.org_id,
            actor=actor.username,
            immediate=req.immediate,
            commerce=commerce,
            orgs=orgs,
            ops=ops,
        )
    except Exception as exc:
        raise HTTPException(502, f"cancel_failed:{exc}") from exc


@router.post("/org/subscription/resume")
async def resume_subscription(
    org: OrgContext = Depends(require_org_owner),
    actor: UserContext = Depends(get_current_user),
    commerce: CommerceStore = Depends(get_commerce_store),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        return resume_package_subscription(
            org.org_id,
            actor=actor.username,
            commerce=commerce,
            ops=ops,
        )
    except Exception as exc:
        raise HTTPException(502, f"resume_failed:{exc}") from exc
