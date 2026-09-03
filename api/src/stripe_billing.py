"""Stripe Checkout Sessions + package/purchase fulfillment.

When STRIPE_SECRET_KEY is unset, callers keep the dummy immediate-fulfill path.
With a key set, create a Checkout Session and fulfill only after the paid
session is confirmed (success URL carries session_id — webhook optional).
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .commerce_store import CommerceStore, gb_to_bytes, get_commerce_store
from .ops_store import OpsStore, get_ops_store
from .org_store import OrgStore, get_org_store
from .user_store import UserStore, get_user_store


def stripe_enabled() -> bool:
    return bool((os.getenv("STRIPE_SECRET_KEY") or "").strip())


def _stripe():
    import stripe

    stripe.api_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    return stripe


def _portal_base(kind: str) -> str:
    login = (os.getenv("COAIR_LOGIN_URL") or "").strip().rstrip("/")
    user = (os.getenv("COAIR_USER_URL") or "").strip().rstrip("/")
    app = (os.getenv("COAIR_APP_URL") or "").strip().rstrip("/")
    if kind == "checkout":
        return login or app or "http://localhost:3002"
    return user or app or login or "http://localhost:3002"


def owner_username(orgs: OrgStore, org_id: str) -> str:
    for member in orgs.list_members(org_id):
        if member.get("role") == "owner":
            return str(member["username"])
    return ""


def create_checkout_session(
    *,
    org_id: str,
    amount_usd: float,
    description: str,
    success_path: str,
    cancel_path: str,
    metadata: Dict[str, str],
) -> Dict[str, str]:
    """Create a Stripe Checkout Session. Amounts are USD."""
    if not stripe_enabled():
        raise RuntimeError("stripe_not_configured")
    cents = max(0, int(round(float(amount_usd) * 100)))
    if cents <= 0:
        raise ValueError("amount_must_be_positive")
    base = _portal_base(metadata.get("flow", "billing"))
    if metadata.get("flow") == "checkout":
        base = _portal_base("checkout")
    success_url = f"{base}{success_path}"
    if "{CHECKOUT_SESSION_ID}" not in success_url:
        sep = "&" if "?" in success_url else "?"
        success_url = f"{success_url}{sep}session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{base}{cancel_path}"
    stripe = _stripe()
    session = stripe.checkout.Session.create(
        mode="payment",
        success_url=success_url,
        cancel_url=cancel_url,
        line_items=[
            {
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": cents,
                    "product_data": {"name": description[:120] or "COAir package"},
                },
            }
        ],
        metadata={**metadata, "org_id": org_id},
        client_reference_id=org_id[:200],
    )
    url = getattr(session, "url", None) or ""
    if not url:
        raise RuntimeError("stripe_session_missing_url")
    return {"checkout_url": url, "session_id": str(session.id)}


def retrieve_paid_session(session_id: str) -> Dict[str, Any]:
    if not stripe_enabled():
        raise RuntimeError("stripe_not_configured")
    if not session_id or not str(session_id).startswith("cs_"):
        raise ValueError("invalid_session_id")
    stripe = _stripe()
    session = stripe.checkout.Session.retrieve(session_id)
    status = str(getattr(session, "payment_status", "") or "")
    amount_total = int(getattr(session, "amount_total", 0) or 0)
    if status not in {"paid", "no_payment_required"} and amount_total > 0:
        raise ValueError("session_not_paid")
    meta = dict(getattr(session, "metadata", None) or {})
    return {
        "id": str(session.id),
        "payment_status": status,
        "amount_total": amount_total,
        "metadata": {str(k): str(v) for k, v in meta.items()},
        "org_id": str(meta.get("org_id") or getattr(session, "client_reference_id", "") or ""),
    }


def _get_fulfillment(commerce: CommerceStore, session_id: str) -> Optional[Dict[str, Any]]:
    with commerce._connect() as conn:
        row = conn.execute(
            "SELECT payload_json FROM stripe_fulfillments WHERE session_id=?",
            [session_id],
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["payload_json"])
    except Exception:
        return None


def _save_fulfillment(
    commerce: CommerceStore,
    *,
    session_id: str,
    org_id: str,
    kind: str,
    payload: Dict[str, Any],
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with commerce._write_lock, commerce._connect() as conn:
        conn.execute(
            "INSERT INTO stripe_fulfillments (session_id, org_id, kind, payload_json, created_at) "
            "VALUES (?,?,?,?,?) ON CONFLICT(session_id) DO NOTHING",
            [session_id, org_id, kind, json.dumps(payload), now],
        )


def fulfill_plan(
    org_id: str,
    plan_id: str,
    actor: str,
    *,
    stripe_session_id: str = "",
    commerce: Optional[CommerceStore] = None,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
    ops: Optional[OpsStore] = None,
) -> Dict[str, Any]:
    commerce = commerce or get_commerce_store()
    orgs = orgs or get_org_store()
    users = users or get_user_store()
    ops = ops or get_ops_store()

    if stripe_session_id:
        existing = _get_fulfillment(commerce, stripe_session_id)
        if existing:
            return existing

    plan = commerce.get_plan(plan_id)
    if not plan:
        raise ValueError("plan_not_found")

    storage_bytes = gb_to_bytes(int(plan["storage_limit_gb"]))
    credits = float(plan["api_credits_usd"])
    token_limit = int(plan.get("query_cap") or 0)
    orgs.update_org(
        org_id,
        default_credits=credits,
        default_storage_bytes=storage_bytes,
        default_token_limit=token_limit,
    )
    subscription = commerce.set_subscription(
        org_id, plan_id=plan_id, needs_checkout=False,
    )
    record = orgs.get_org(org_id) or {}
    owner = owner_username(orgs, org_id)
    if owner:
        try:
            users.billing.update_account(owner, storage_limit_bytes=storage_bytes)
        except Exception:
            pass
        try:
            users.update_user(owner, token_limit=token_limit)
        except Exception:
            pass
    invoice = ops.create_invoice(
        org_id,
        amount_usd=credits,
        status="paid",
        description=f"{plan['name']} package",
    )
    ops.record_audit(
        actor=actor,
        action="company.plan_change",
        target_type="company",
        target_id=org_id,
        target_label=record.get("name") or org_id,
        detail=f"Checked out {plan['name']}"
        + (f" (stripe:{stripe_session_id})" if stripe_session_id else ""),
    )
    result = {
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
    if stripe_session_id:
        _save_fulfillment(
            commerce,
            session_id=stripe_session_id,
            org_id=org_id,
            kind="plan",
            payload=result,
        )
    return result


def fulfill_purchase(
    org_id: str,
    *,
    kind: str,
    actor: str,
    amount_usd: float = 0,
    tokens: Optional[int] = None,
    gb: Optional[int] = None,
    plan_id: Optional[str] = None,
    module_id: Optional[str] = None,
    description: str = "",
    stripe_session_id: str = "",
    commerce: Optional[CommerceStore] = None,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
    ops: Optional[OpsStore] = None,
) -> Dict[str, Any]:
    commerce = commerce or get_commerce_store()
    orgs = orgs or get_org_store()
    users = users or get_user_store()
    ops = ops or get_ops_store()

    if stripe_session_id:
        existing = _get_fulfillment(commerce, stripe_session_id)
        if existing:
            return existing.get("invoice") or existing

    description = (description or "").strip()
    amount = float(amount_usd)
    owner = owner_username(orgs, org_id)

    if kind == "upgrade":
        if not plan_id:
            raise ValueError("plan_id_required")
        plan = commerce.get_plan(plan_id)
        if not plan:
            raise ValueError("plan_not_found")
        amount = amount or float(plan["api_credits_usd"])
        storage_bytes = gb_to_bytes(int(plan["storage_limit_gb"]))
        token_limit = int(plan.get("query_cap") or 0)
        orgs.update_org(
            org_id,
            default_credits=float(plan["api_credits_usd"]),
            default_storage_bytes=storage_bytes,
            default_token_limit=token_limit,
        )
        commerce.set_subscription(org_id, plan_id=plan_id, needs_checkout=False)
        if owner:
            try:
                users.billing.update_account(owner, storage_limit_bytes=storage_bytes)
            except Exception:
                pass
            try:
                users.update_user(owner, token_limit=token_limit)
            except Exception:
                pass
        description = description or f"Upgrade to {plan['name']}"
    elif kind == "storage":
        if not gb:
            raise ValueError("gb_required")
        record = orgs.get_org(org_id) or {}
        extra = gb_to_bytes(int(gb))
        new_limit = int(record.get("default_storage_bytes") or 0) + extra
        orgs.update_org(org_id, default_storage_bytes=new_limit)
        if owner:
            try:
                users.billing.update_account(owner, storage_limit_bytes=new_limit)
            except Exception:
                pass
        amount = amount or float({10: 10, 50: 40, 100: 70}.get(int(gb), gb))
        description = description or f"Storage +{gb} GB"
    elif kind == "tokens":
        add = int(tokens or 0)
        if add < 1:
            raise ValueError("tokens_required")
        if owner:
            user = users.get_user(owner) or {}
            current = int(user.get("token_limit") or 0)
            users.update_user(owner, token_limit=current + add)
        amount = amount or 0
        description = description or f"Token pack {add}"
    else:
        description = description or f"Add-on {module_id or ''}".strip()
        amount = amount or 50

    invoice = ops.create_invoice(
        org_id, amount_usd=amount, status="paid", description=description,
    )
    action = (
        "tokens.topup_approve" if kind == "tokens"
        else "company.plan_change" if kind == "upgrade"
        else "company.addon"
    )
    paid_via = "Stripe" if stripe_session_id else "Dummy"
    ops.record_audit(
        actor=actor,
        action=action,
        target_type="invoice",
        target_id=invoice["id"],
        target_label=description or invoice["id"],
        detail=f"{paid_via} purchase {kind} ${amount:.2f}",
    )
    if stripe_session_id:
        _save_fulfillment(
            commerce,
            session_id=stripe_session_id,
            org_id=org_id,
            kind=kind,
            payload={"invoice": invoice},
        )
    return invoice
