"""Notify company owners about billing events when email prefs allow it."""

from __future__ import annotations

from typing import Any, Dict, Optional

from src.email_delivery import recipient_address, send_coair_email
from src.logger import logger
from src.org_store import OrgStore, get_org_store
from src.stripe_billing import owner_username
from src.user_store import UserStore, get_user_store


def user_email_notifications_enabled(user: Optional[Dict[str, Any]]) -> bool:
    if not user:
        return True
    features = user.get("features") or {}
    # Default ON so customers get billing mail unless they opt out.
    return bool(features.get("notify_email", True))


def notify_org_billing(
    org_id: str,
    kind: str,
    *,
    invoice: Optional[Dict[str, Any]] = None,
    description: str = "",
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
) -> None:
    try:
        orgs = orgs or get_org_store()
        users = users or get_user_store()
        owner = owner_username(orgs, org_id)
        if not owner:
            return
        user = users.get_user(owner) or {}
        if not user_email_notifications_enabled(user):
            logger.info("billing_email_skipped prefs_off org=%s owner=%s", org_id, owner)
            return
        org = orgs.get_org(org_id) or {}
        invoice = invoice or {}
        amount = float(invoice.get("amount_usd") or 0)
        amount_label = f"${amount:,.2f}"
        send_coair_email(
            kind,
            recipient_address(owner),
            name=str(user.get("display_name") or owner),
            company_name=str(org.get("name") or ""),
            invoice_id=str(invoice.get("id") or ""),
            amount_label=amount_label,
            description=description or str(invoice.get("description") or ""),
        )
    except Exception as exc:
        logger.warning("billing_email_failed org=%s kind=%s err=%s", org_id, kind, exc)
