"""Stripe webhooks for subscription renewals and status sync."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from src.logger import logger
from src.stripe_billing import (
    find_org_id_for_stripe_subscription,
    fulfill_plan,
    renew_package_period,
    stripe_enabled,
    sync_stripe_subscription_object,
    webhook_secret,
    _period_end_iso,
    _stripe,
)


router = APIRouter()


def _obj_dict(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "to_dict"):
        try:
            return dict(value.to_dict())
        except Exception:
            pass
    return {}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    if not stripe_enabled():
        raise HTTPException(400, "stripe_not_configured")
    secret = webhook_secret()
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    stripe = _stripe()
    try:
        if secret:
            event = stripe.Webhook.construct_event(payload, sig, secret)
        else:
            # Dev fallback when webhook secret is unset.
            import json

            event = json.loads(payload.decode("utf-8"))
    except Exception as exc:
        logger.warning("stripe_webhook_invalid err=%s", exc)
        raise HTTPException(400, "invalid_webhook") from exc

    event_type = event["type"] if isinstance(event, dict) else event.type
    data_object = (
        event["data"]["object"]
        if isinstance(event, dict)
        else event.data.object
    )

    if event_type == "checkout.session.completed":
        session = data_object
        mode = str(getattr(session, "mode", None) or session.get("mode") or "")
        meta = _obj_dict(getattr(session, "metadata", None) or session.get("metadata"))
        if mode == "subscription" and (meta.get("kind") or "plan") == "plan":
            org_id = str(
                meta.get("org_id")
                or getattr(session, "client_reference_id", None)
                or session.get("client_reference_id")
                or ""
            )
            plan_id = str(meta.get("plan_id") or "")
            if org_id and plan_id:
                sub_id = str(
                    getattr(session, "subscription", None)
                    or session.get("subscription")
                    or ""
                )
                customer_id = str(
                    getattr(session, "customer", None)
                    or session.get("customer")
                    or ""
                )
                period_end = None
                if sub_id:
                    try:
                        sub = stripe.Subscription.retrieve(sub_id)
                        ts = getattr(sub, "current_period_end", None)
                        if ts:
                            period_end = _period_end_iso(from_ts=int(ts))
                        sync_stripe_subscription_object(sub)
                    except Exception as exc:
                        logger.warning(
                            "stripe_webhook_sub_retrieve_failed sub=%s err=%s",
                            sub_id,
                            exc,
                        )
                try:
                    fulfill_plan(
                        org_id,
                        plan_id,
                        "stripe:webhook",
                        stripe_session_id=str(
                            getattr(session, "id", None) or session.get("id") or ""
                        ),
                        stripe_customer_id=customer_id,
                        stripe_subscription_id=sub_id,
                        current_period_end=period_end,
                    )
                except Exception as exc:
                    logger.warning(
                        "stripe_webhook_fulfill_plan_failed org=%s err=%s",
                        org_id,
                        exc,
                    )

    elif event_type == "invoice.paid":
        invoice = data_object
        billing_reason = str(
            getattr(invoice, "billing_reason", None)
            or invoice.get("billing_reason")
            or ""
        )
        if billing_reason == "subscription_cycle":
            sub_id = str(
                getattr(invoice, "subscription", None)
                or invoice.get("subscription")
                or ""
            )
            org_id = find_org_id_for_stripe_subscription(sub_id)
            if not org_id and sub_id:
                try:
                    sub = stripe.Subscription.retrieve(sub_id)
                    synced = sync_stripe_subscription_object(sub)
                    org_id = find_org_id_for_stripe_subscription(sub_id)
                    if not org_id and synced:
                        # metadata path
                        meta = _obj_dict(getattr(sub, "metadata", None))
                        org_id = str(meta.get("org_id") or "")
                except Exception as exc:
                    logger.warning(
                        "stripe_webhook_renew_lookup_failed sub=%s err=%s",
                        sub_id,
                        exc,
                    )
            if org_id:
                amount = int(
                    getattr(invoice, "amount_paid", None)
                    or invoice.get("amount_paid")
                    or 0
                )
                period_end = None
                if sub_id:
                    try:
                        sub = stripe.Subscription.retrieve(sub_id)
                        ts = getattr(sub, "current_period_end", None)
                        if ts:
                            period_end = _period_end_iso(from_ts=int(ts))
                        sync_stripe_subscription_object(sub)
                    except Exception:
                        pass
                try:
                    renew_package_period(
                        org_id,
                        actor="stripe:webhook",
                        period_end=period_end,
                        amount_usd=amount / 100.0,
                        stripe_invoice_id=str(
                            getattr(invoice, "id", None) or invoice.get("id") or ""
                        ),
                    )
                except Exception as exc:
                    logger.warning(
                        "stripe_webhook_renew_failed org=%s err=%s",
                        org_id,
                        exc,
                    )

    elif event_type in (
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        try:
            synced = sync_stripe_subscription_object(data_object)
            if event_type == "customer.subscription.deleted":
                from src.stripe_billing import cancel_package_subscription
                from src.commerce_store import get_commerce_store
                from src.org_store import get_org_store
                from src.ops_store import get_ops_store

                meta = _obj_dict(
                    getattr(data_object, "metadata", None)
                    or (data_object.get("metadata") if isinstance(data_object, dict) else None)
                )
                org_id = str(meta.get("org_id") or "")
                if not org_id and synced:
                    # find by subscription id
                    sub_id = str(
                        getattr(data_object, "id", None)
                        or (data_object.get("id") if isinstance(data_object, dict) else "")
                        or ""
                    )
                    org_id = find_org_id_for_stripe_subscription(sub_id)
                if org_id:
                    cancel_package_subscription(
                        org_id,
                        actor="stripe:webhook",
                        immediate=True,
                        commerce=get_commerce_store(),
                        orgs=get_org_store(),
                        ops=get_ops_store(),
                    )
        except Exception as exc:
            logger.warning("stripe_webhook_sub_sync_failed err=%s", exc)

    return {"received": True}
