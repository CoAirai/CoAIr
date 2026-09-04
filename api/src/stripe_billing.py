"""Stripe Checkout Sessions + package/purchase fulfillment.

When STRIPE_SECRET_KEY is unset, callers keep the dummy immediate-fulfill path.
With a key set, create a Checkout Session and fulfill only after the paid
session is confirmed (success URL carries session_id — webhook optional).
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from .commerce_store import CommerceStore, gb_to_bytes, get_commerce_store
from .logger import logger
from .ops_store import OpsStore, get_ops_store
from .org_store import OrgStore, get_org_store
from .user_store import UserStore, get_user_store


def stripe_enabled() -> bool:
    return bool((os.getenv("STRIPE_SECRET_KEY") or "").strip())


def webhook_secret() -> str:
    return (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()


def _stripe():
    import stripe

    stripe.api_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
    return stripe


def _period_end_iso(*, days: int = 30, from_ts: Optional[int] = None) -> str:
    if from_ts:
        return datetime.fromtimestamp(int(from_ts), tz=timezone.utc).isoformat()
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


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
        metadata={**metadata, "org_id": org_id, "amount_usd": str(amount_usd)},
        client_reference_id=org_id[:200],
    )
    url = getattr(session, "url", None) or ""
    if not url:
        raise RuntimeError("stripe_session_missing_url")
    return {"checkout_url": url, "session_id": str(session.id)}


def create_plan_subscription_checkout(
    *,
    org_id: str,
    amount_usd: float,
    description: str,
    plan_id: str,
    success_path: str,
    cancel_path: str,
    flow: str = "billing",
    extra_metadata: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    """Monthly auto-renewing Stripe Checkout for a company package."""
    if not stripe_enabled():
        raise RuntimeError("stripe_not_configured")
    cents = max(0, int(round(float(amount_usd) * 100)))
    if cents <= 0:
        raise ValueError("amount_must_be_positive")
    base = _portal_base(flow)
    success_url = f"{base}{success_path}"
    if "{CHECKOUT_SESSION_ID}" not in success_url:
        sep = "&" if "?" in success_url else "?"
        success_url = f"{success_url}{sep}session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{base}{cancel_path}"
    stripe = _stripe()
    session = stripe.checkout.Session.create(
        mode="subscription",
        success_url=success_url,
        cancel_url=cancel_url,
        line_items=[
            {
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": cents,
                    "recurring": {"interval": "month"},
                    "product_data": {
                        "name": (description[:120] or f"COAir {plan_id}"),
                    },
                },
            }
        ],
        metadata={
            "flow": flow,
            "kind": "plan",
            "plan_id": plan_id,
            "org_id": org_id,
            "description": description[:200],
            "amount_usd": str(amount_usd),
            **{
                key: str(value)
                for key, value in (extra_metadata or {}).items()
                if value is not None and str(value) != ""
            },
        },
        subscription_data={
            "metadata": {
                "org_id": org_id,
                "plan_id": plan_id,
            }
        },
        client_reference_id=org_id[:200],
    )
    url = getattr(session, "url", None) or ""
    if not url:
        raise RuntimeError("stripe_session_missing_url")
    return {"checkout_url": url, "session_id": str(session.id)}


def _metadata_dict(value: Any) -> Dict[str, str]:
    """Convert Stripe metadata StripeObject / dict into a plain str→str map."""
    if value is None:
        return {}
    if hasattr(value, "to_dict"):
        try:
            value = value.to_dict()
        except Exception:
            pass
    if isinstance(value, dict):
        return {str(k): str(v) for k, v in value.items() if v is not None}
    # Older SDKs expose key access without being a real dict.
    out: Dict[str, str] = {}
    try:
        for key in ("org_id", "kind", "plan_id", "tokens", "gb", "module_id", "description", "amount_usd", "flow"):
            item = value.get(key) if hasattr(value, "get") else getattr(value, key, None)
            if item is not None:
                out[key] = str(item)
    except Exception:
        return {}
    return out


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
    meta = _metadata_dict(getattr(session, "metadata", None))
    subscription_id = getattr(session, "subscription", None) or ""
    customer_id = getattr(session, "customer", None) or ""
    return {
        "id": str(session.id),
        "payment_status": status,
        "amount_total": amount_total,
        "metadata": meta,
        "mode": str(getattr(session, "mode", "") or ""),
        "subscription_id": str(subscription_id or ""),
        "customer_id": str(customer_id or ""),
        "org_id": str(
            meta.get("org_id")
            or getattr(session, "client_reference_id", "")
            or ""
        ),
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


def _org_usage_totals(
    org_id: str,
    *,
    orgs: OrgStore,
    users: UserStore,
) -> Dict[str, int]:
    total_used = 0
    storage_used = 0
    for member in orgs.list_members(org_id):
        username = str(member.get("username") or "")
        if not username:
            continue
        total_used += int(users.get_usage(username).get("used_tokens") or 0)
        try:
            snap = users.billing.summary(username)
            storage_used += int(snap.get("storage_used_bytes") or 0)
        except Exception:
            pass
    return {"used_tokens": total_used, "storage_used_bytes": storage_used}


def fulfill_plan(
    org_id: str,
    plan_id: str,
    actor: str,
    *,
    stripe_session_id: str = "",
    stripe_customer_id: str = "",
    stripe_subscription_id: str = "",
    current_period_end: Optional[str] = None,
    amount_usd: Optional[float] = None,
    invoice_description: Optional[str] = None,
    carry_remaining: bool = False,
    commerce: Optional[CommerceStore] = None,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
    ops: Optional[OpsStore] = None,
) -> Dict[str, Any]:
    """Apply a catalog package to an org.

    ``carry_remaining=True`` (mid-cycle change/downgrade/upgrade): keep unused
    tokens and storage and add them on top of the new plan caps; do not reset
    usage. On the next renewal, ``renew_package_period`` clears carryover and
    applies clean catalog limits.
    """
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

    previous = commerce.get_subscription(org_id) or {}
    old_sub_id = (previous.get("stripe_subscription_id") or "").strip()
    if (
        stripe_subscription_id
        and old_sub_id
        and old_sub_id != stripe_subscription_id
        and stripe_enabled()
    ):
        try:
            _stripe().Subscription.delete(old_sub_id)
        except Exception as exc:
            logger.warning(
                "stripe_replace_old_subscription_failed org=%s sub=%s err=%s",
                org_id,
                old_sub_id,
                exc,
            )

    from src.org_quota import resolve_org_token_limit, sync_org_member_quotas

    base_storage = gb_to_bytes(int(plan["storage_limit_gb"]))
    base_tokens = int(plan.get("query_cap") or 0)
    credits = float(plan["api_credits_usd"])

    remaining_tokens = 0
    remaining_storage = 0
    if carry_remaining:
        usage = _org_usage_totals(org_id, orgs=orgs, users=users)
        old_pool = resolve_org_token_limit(
            org_id, orgs=orgs, commerce=commerce
        )
        remaining_tokens = max(0, old_pool - int(usage["used_tokens"]))
        old_storage = int(
            (orgs.get_org(org_id) or {}).get("default_storage_bytes") or 0
        )
        remaining_storage = max(
            0, old_storage - int(usage["storage_used_bytes"])
        )
        # Never set storage below what is already used.
        token_limit = max(
            base_tokens + remaining_tokens, int(usage["used_tokens"])
        )
        storage_bytes = max(
            base_storage + remaining_storage, int(usage["storage_used_bytes"])
        )
    else:
        token_limit = base_tokens
        storage_bytes = base_storage

    orgs.update_org(
        org_id,
        default_credits=credits,
        default_storage_bytes=storage_bytes,
        default_token_limit=token_limit,
    )

    if current_period_end:
        period_end = current_period_end
    elif carry_remaining and previous.get("current_period_end"):
        period_end = str(previous["current_period_end"])
    else:
        period_end = _period_end_iso()

    next_customer = stripe_customer_id or previous.get("stripe_customer_id") or None
    next_subscription = (
        stripe_subscription_id
        if stripe_subscription_id
        else previous.get("stripe_subscription_id")
    ) or None
    subscription = commerce.set_subscription(
        org_id,
        plan_id=plan_id,
        needs_checkout=False,
        stripe_customer_id=next_customer,
        stripe_subscription_id=next_subscription,
        status="active",
        cancel_at_period_end=False,
        current_period_end=period_end,
        auto_renew=True,
    )
    record = orgs.get_org(org_id) or {}

    sync_org_member_quotas(
        org_id,
        token_limit=token_limit,
        storage_limit_bytes=storage_bytes,
        orgs=orgs,
        users=users,
        commerce=commerce,
        reset_usage=not carry_remaining,
    )
    charged = float(amount_usd) if amount_usd is not None else (
        0.0 if carry_remaining else credits
    )
    description = invoice_description or (
        f"{plan['name']} package change"
        if carry_remaining
        else f"{plan['name']} package"
    )
    if carry_remaining and (remaining_tokens or remaining_storage):
        description = (
            f"{description} (carried {remaining_tokens} tokens, "
            f"{remaining_storage} storage bytes)"
        )
    invoice = ops.create_invoice(
        org_id,
        amount_usd=charged,
        status="paid",
        description=description,
    )
    ops.record_audit(
        actor=actor,
        action="company.plan_change",
        target_type="company",
        target_id=org_id,
        target_label=record.get("name") or org_id,
        detail=(
            ("Changed" if carry_remaining else "Checked out")
            + f" {plan['name']}"
            + (
                f" carry_tokens={remaining_tokens}"
                f" carry_storage={remaining_storage}"
                if carry_remaining
                else ""
            )
            + (f" (stripe:{stripe_session_id})" if stripe_session_id else "")
        ),
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
        "carryover": {
            "enabled": carry_remaining,
            "remaining_tokens": remaining_tokens,
            "remaining_storage_bytes": remaining_storage,
            "token_limit": token_limit,
            "storage_limit_bytes": storage_bytes,
            "base_token_limit": base_tokens,
            "base_storage_bytes": base_storage,
        },
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


def renew_package_period(
    org_id: str,
    *,
    actor: str = "system:renewal",
    period_end: Optional[str] = None,
    amount_usd: Optional[float] = None,
    stripe_invoice_id: str = "",
    commerce: Optional[CommerceStore] = None,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
    ops: Optional[OpsStore] = None,
) -> Dict[str, Any]:
    """On package renewal: clear carryover and apply clean catalog plan limits."""
    commerce = commerce or get_commerce_store()
    orgs = orgs or get_org_store()
    users = users or get_user_store()
    ops = ops or get_ops_store()

    sub = commerce.get_subscription(org_id)
    plan_id = str(sub.get("plan_id") or "demo")
    plan = commerce.get_plan(plan_id) or {}
    from src.org_quota import sync_org_member_quotas

    # Always use catalog caps — do not keep mid-cycle carryover into the next period.
    token_limit = int(plan.get("query_cap") or 0)
    storage_bytes = gb_to_bytes(int(plan.get("storage_limit_gb") or 0))
    credits = float(plan.get("api_credits_usd") or 0)
    orgs.update_org(
        org_id,
        default_credits=credits,
        default_storage_bytes=storage_bytes,
        default_token_limit=token_limit,
    )
    sync_org_member_quotas(
        org_id,
        token_limit=token_limit,
        storage_limit_bytes=storage_bytes,
        orgs=orgs,
        users=users,
        commerce=commerce,
        reset_usage=True,
    )
    next_end = period_end or _period_end_iso()
    subscription = commerce.set_subscription(
        org_id,
        plan_id=plan_id,
        needs_checkout=False,
        status="active",
        cancel_at_period_end=False,
        current_period_end=next_end,
        auto_renew=True,
    )
    amount = float(
        amount_usd
        if amount_usd is not None
        else (plan.get("api_credits_usd") or 0)
    )
    description = f"{plan.get('name') or plan_id} package renewal"
    if stripe_invoice_id:
        description = f"{description} ({stripe_invoice_id})"
    invoice = ops.create_invoice(
        org_id, amount_usd=amount, status="paid", description=description,
    )
    ops.record_audit(
        actor=actor,
        action="company.plan_renew",
        target_type="company",
        target_id=org_id,
        target_label=org_id,
        detail=f"Renewed {plan_id}; catalog limits applied, usage reset",
    )
    logger.info(
        "org_package_renewed org=%s plan=%s period_end=%s",
        org_id,
        plan_id,
        next_end,
    )
    return {
        "org_id": org_id,
        "subscription": subscription,
        "invoice": invoice,
        "token_limit": token_limit,
        "storage_limit_bytes": storage_bytes,
    }


def cancel_package_subscription(
    org_id: str,
    *,
    actor: str,
    immediate: bool = False,
    commerce: Optional[CommerceStore] = None,
    orgs: Optional[OrgStore] = None,
    ops: Optional[OpsStore] = None,
) -> Dict[str, Any]:
    commerce = commerce or get_commerce_store()
    orgs = orgs or get_org_store()
    ops = ops or get_ops_store()
    sub = commerce.get_subscription(org_id)
    plan_id = str(sub.get("plan_id") or "demo")
    stripe_sub = (sub.get("stripe_subscription_id") or "").strip()

    if stripe_sub and stripe_enabled():
        stripe = _stripe()
        if immediate:
            stripe.Subscription.delete(stripe_sub)
        else:
            stripe.Subscription.modify(stripe_sub, cancel_at_period_end=True)

    if immediate:
        subscription = commerce.set_subscription(
            org_id,
            plan_id="demo",
            needs_checkout=False,
            status="canceled",
            cancel_at_period_end=False,
            auto_renew=False,
            stripe_subscription_id="",
        )
        # Clear paid pool to demo defaults.
        plan = commerce.get_plan("demo") or {}
        token_limit = int(plan.get("query_cap") or 0)
        storage_bytes = gb_to_bytes(int(plan.get("storage_limit_gb") or 0))
        orgs.update_org(
            org_id,
            default_credits=float(plan.get("api_credits_usd") or 0),
            default_storage_bytes=storage_bytes,
            default_token_limit=token_limit,
        )
        from src.org_quota import sync_org_member_quotas
        from src.user_store import get_user_store

        sync_org_member_quotas(
            org_id,
            token_limit=token_limit,
            storage_limit_bytes=storage_bytes,
            orgs=orgs,
            users=get_user_store(),
            commerce=commerce,
            reset_usage=False,
        )
    else:
        subscription = commerce.set_subscription(
            org_id,
            plan_id=plan_id,
            needs_checkout=False,
            status="active",
            cancel_at_period_end=True,
            auto_renew=False,
        )

    ops.record_audit(
        actor=actor,
        action="company.plan_cancel",
        target_type="company",
        target_id=org_id,
        target_label=org_id,
        detail=(
            "Cancelled package immediately"
            if immediate
            else "Cancelled auto-renew; access until period end"
        ),
    )
    return {"subscription": subscription, "immediate": immediate}


def resume_package_subscription(
    org_id: str,
    *,
    actor: str,
    commerce: Optional[CommerceStore] = None,
    ops: Optional[OpsStore] = None,
) -> Dict[str, Any]:
    commerce = commerce or get_commerce_store()
    ops = ops or get_ops_store()
    sub = commerce.get_subscription(org_id)
    plan_id = str(sub.get("plan_id") or "demo")
    stripe_sub = (sub.get("stripe_subscription_id") or "").strip()
    if stripe_sub and stripe_enabled():
        _stripe().Subscription.modify(stripe_sub, cancel_at_period_end=False)
    subscription = commerce.set_subscription(
        org_id,
        plan_id=plan_id,
        needs_checkout=False,
        status="active",
        cancel_at_period_end=False,
        auto_renew=True,
    )
    ops.record_audit(
        actor=actor,
        action="company.plan_resume",
        target_type="company",
        target_id=org_id,
        target_label=org_id,
        detail="Resumed package auto-renew",
    )
    return {"subscription": subscription}


def sync_stripe_subscription_object(
    subscription_obj: Any,
    *,
    commerce: Optional[CommerceStore] = None,
) -> Optional[Dict[str, Any]]:
    commerce = commerce or get_commerce_store()
    meta = _metadata_dict(getattr(subscription_obj, "metadata", None))
    org_id = (meta.get("org_id") or "").strip()
    if not org_id:
        # Look up by stripe subscription id
        sub_id = str(getattr(subscription_obj, "id", "") or "")
        for row in commerce.list_subscriptions():
            if (row.get("stripe_subscription_id") or "") == sub_id:
                org_id = row["org_id"]
                break
    if not org_id:
        return None
    current = commerce.get_subscription(org_id)
    plan_id = (
        (meta.get("plan_id") or "").strip()
        or current.get("plan_id")
        or "demo"
    )
    status = str(getattr(subscription_obj, "status", "") or "active")
    cancel_at = bool(getattr(subscription_obj, "cancel_at_period_end", False))
    period_end_ts = getattr(subscription_obj, "current_period_end", None)
    period_end = (
        _period_end_iso(from_ts=int(period_end_ts)) if period_end_ts else None
    )
    customer = getattr(subscription_obj, "customer", None)
    return commerce.set_subscription(
        org_id,
        plan_id=plan_id,
        needs_checkout=False,
        stripe_customer_id=str(customer) if customer else None,
        stripe_subscription_id=str(getattr(subscription_obj, "id", "") or ""),
        status=status,
        cancel_at_period_end=cancel_at,
        current_period_end=period_end,
        auto_renew=not cancel_at and status == "active",
    )


def find_org_id_for_stripe_subscription(
    subscription_id: str,
    *,
    commerce: Optional[CommerceStore] = None,
) -> str:
    commerce = commerce or get_commerce_store()
    for row in commerce.list_subscriptions():
        if (row.get("stripe_subscription_id") or "") == subscription_id:
            return str(row.get("org_id") or "")
    return ""


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
    credit_username: Optional[str] = None,
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
        description = description or f"Change to {plan['name']}"
        result = fulfill_plan(
            org_id,
            plan_id,
            actor,
            amount_usd=amount,
            invoice_description=description,
            carry_remaining=True,
            stripe_session_id=stripe_session_id,
            commerce=commerce,
            orgs=orgs,
            users=users,
            ops=ops,
        )
        return result.get("invoice") or result
    elif kind == "storage":
        if not gb:
            raise ValueError("gb_required")
        record = orgs.get_org(org_id) or {}
        extra = gb_to_bytes(int(gb))
        new_limit = int(record.get("default_storage_bytes") or 0) + extra
        orgs.update_org(org_id, default_storage_bytes=new_limit)
        from src.org_quota import sync_org_member_quotas

        sync_org_member_quotas(
            org_id,
            storage_limit_bytes=new_limit,
            orgs=orgs,
            users=users,
            commerce=commerce,
        )
        amount = amount or float({10: 10, 50: 40, 100: 70}.get(int(gb), gb))
        description = description or f"Storage +{gb} GB"
    elif kind == "tokens":
        add = int(tokens or 0)
        if add < 1:
            raise ValueError("tokens_required")
        from src.org_quota import resolve_org_token_limit, sync_org_member_quotas

        current = resolve_org_token_limit(
            org_id, orgs=orgs, commerce=commerce
        )
        new_limit = current + add
        orgs.update_org(org_id, default_token_limit=new_limit)
        credit_to = (credit_username or "").strip()
        if credit_to:
            members = {m["username"] for m in orgs.list_members(org_id)}
            if credit_to not in members:
                raise ValueError("credit_user_not_in_org")
            recip = users.get_user(credit_to)
            if not recip:
                raise ValueError("credit_user_not_found")
            users.update_user(
                credit_to,
                token_limit=int(recip.get("token_limit") or 0) + add,
            )
        else:
            sync_org_member_quotas(
                org_id,
                token_limit=new_limit,
                orgs=orgs,
                users=users,
                commerce=commerce,
            )
        amount = amount or 0
        description = description or (
            f"Token pack {add} for {credit_to}"
            if credit_to
            else f"Token pack {add}"
        )
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
    try:
        from src.billing_notify import notify_org_billing

        notify_org_billing(
            org_id,
            "purchase_receipt" if kind != "upgrade" else "invoice_paid",
            invoice=invoice,
            description=description,
            orgs=orgs,
            users=users,
        )
    except Exception:
        pass
    if stripe_session_id:
        _save_fulfillment(
            commerce,
            session_id=stripe_session_id,
            org_id=org_id,
            kind=kind,
            payload={"invoice": invoice},
        )
    return invoice
