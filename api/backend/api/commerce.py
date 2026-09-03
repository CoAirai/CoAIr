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


class ConfirmCheckoutRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=200)


class CancelSubscriptionRequest(BaseModel):
    immediate: bool = False


@router.get("/packages")
async def list_packages(
    _user: UserContext = Depends(get_current_user),
    store: CommerceStore = Depends(get_commerce_store),
):
    return {"plans": store.list_plans()}


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

    if stripe_enabled():
        amount = float(plan["api_credits_usd"])
        if amount <= 0:
            return fulfill_plan(
                org.org_id, req.plan_id, actor.username,
                commerce=commerce, orgs=orgs, users=users, ops=ops,
            )
        try:
            session = create_plan_subscription_checkout(
                org_id=org.org_id,
                amount_usd=amount,
                description=f"{plan['name']} package (monthly)",
                plan_id=req.plan_id,
                success_path="/onboarding/checkout?session_id={CHECKOUT_SESSION_ID}",
                cancel_path=f"/onboarding/checkout?plan={req.plan_id}&cancelled=1",
                flow="checkout",
            )
        except Exception as exc:
            raise HTTPException(502, f"stripe_session_failed:{exc}") from exc
        return session

    return fulfill_plan(
        org.org_id, req.plan_id, actor.username,
        commerce=commerce, orgs=orgs, users=users, ops=ops,
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

    try:
        return fulfill_plan(
            org.org_id,
            plan_id,
            actor.username,
            stripe_session_id=session["id"],
            stripe_customer_id=session.get("customer_id") or "",
            stripe_subscription_id=sub_id,
            current_period_end=period_end,
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
