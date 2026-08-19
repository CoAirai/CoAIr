"""Authenticated catalog and owner checkout for COAir packages."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.core.orgs import OrgContext, require_org_owner
from backend.core.security import UserContext, get_current_user
from src.commerce_store import CommerceStore, gb_to_bytes, get_commerce_store
from src.ops_store import OpsStore, get_ops_store
from src.org_store import OrgStore, get_org_store
from src.user_store import UserStore, get_user_store


router = APIRouter()


class CheckoutRequest(BaseModel):
    plan_id: Literal["demo", "foundation", "pro", "enterprise", "custom"]


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
    storage_bytes = gb_to_bytes(int(plan["storage_limit_gb"]))
    credits = float(plan["api_credits_usd"])
    orgs.update_org(
        org.org_id,
        default_credits=credits,
        default_storage_bytes=storage_bytes,
    )
    subscription = commerce.set_subscription(
        org.org_id, plan_id=req.plan_id, needs_checkout=False,
    )
    record = orgs.get_org(org.org_id) or {}
    owner = _owner_username(orgs, org.org_id)
    if owner:
        try:
            users.billing.update_account(owner, storage_limit_bytes=storage_bytes)
        except Exception:
            pass
    invoice = ops.create_invoice(
        org.org_id,
        amount_usd=credits,
        status="paid",
        description=f"{plan['name']} package",
    )
    ops.record_audit(
        actor=actor.username,
        action="company.plan_change",
        target_type="company",
        target_id=org.org_id,
        target_label=record.get("name") or org.org_id,
        detail=f"Checked out {plan['name']}",
    )
    return {
        "org": {key: record.get(key) for key in
                ("org_id", "name", "slug", "created_at", "archived_at")},
        "policy": {
            "default_plan_type": record.get("default_plan_type", "demo"),
            "default_credits": float(record.get("default_credits") or 0),
            "default_token_limit": int(record.get("default_token_limit") or 0),
            "default_storage_bytes": int(record.get("default_storage_bytes") or 0),
            "project_limit": int(record.get("project_limit") or 0),
            "allow_member_projects": bool(record.get("allow_member_projects")),
        },
        "subscription": subscription,
        "plan": plan,
        "invoice": invoice,
    }


def _owner_username(orgs: OrgStore, org_id: str) -> str:
    for member in orgs.list_members(org_id):
        if member.get("role") == "owner":
            return str(member["username"])
    return ""
