"""Authenticated catalog and owner checkout for COAir packages."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.orgs import OrgContext, require_org_owner
from backend.core.security import UserContext, get_current_user
from src.commerce_store import CommerceStore, get_commerce_store
from src.ops_store import OpsStore, get_ops_store
from src.org_store import OrgStore, get_org_store
from src.stripe_billing import (
    create_checkout_session,
    fulfill_plan,
    retrieve_paid_session,
    stripe_enabled,
)
from src.user_store import UserStore, get_user_store


router = APIRouter()


class CheckoutRequest(BaseModel):
    plan_id: Literal["demo", "foundation", "pro", "enterprise", "custom"]


class ConfirmCheckoutRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=200)


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
            session = create_checkout_session(
                org_id=org.org_id,
                amount_usd=amount,
                description=f"{plan['name']} package",
                success_path="/onboarding/checkout?session_id={CHECKOUT_SESSION_ID}",
                cancel_path=f"/onboarding/checkout?plan={req.plan_id}&cancelled=1",
                metadata={
                    "flow": "checkout",
                    "kind": "plan",
                    "plan_id": req.plan_id,
                },
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
    try:
        return fulfill_plan(
            org.org_id, plan_id, actor.username,
            stripe_session_id=session["id"],
            commerce=commerce, orgs=orgs, users=users, ops=ops,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
