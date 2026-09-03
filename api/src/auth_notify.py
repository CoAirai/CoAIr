"""Account security emails: login alerts and password-reset notices."""

from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from src.email_delivery import recipient_address, send_coair_email
from src.logger import logger
from src.org_store import OrgStore, get_org_store
from src.stripe_billing import owner_username
from src.user_store import UserStore, get_user_store


def user_email_notifications_enabled(user: Optional[Dict[str, Any]]) -> bool:
    if not user:
        return True
    features = user.get("features") or {}
    return bool(features.get("notify_email", True))


def _org_context(
    username: str,
    *,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
) -> Tuple[Optional[Dict[str, Any]], str, str, Optional[Dict[str, Any]]]:
    orgs = orgs or get_org_store()
    users = users or get_user_store()
    membership = orgs.membership_for(username)
    if not membership:
        return None, "", "", None
    org_id = str(membership.get("org_id") or "")
    company_name = str(membership.get("org_name") or "")
    owner = owner_username(orgs, org_id) if org_id else ""
    owner_user = users.get_user(owner) if owner else None
    return membership, company_name, owner, owner_user


def notify_login(
    username: str,
    *,
    record: Optional[Dict[str, Any]] = None,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
) -> None:
    """Email the signed-in user and their company admin on every successful login."""
    try:
        users = users or get_user_store()
        orgs = orgs or get_org_store()
        user = record or users.get_user(username) or {}
        display = str(user.get("display_name") or username)
        membership, company_name, owner, owner_user = _org_context(
            username, orgs=orgs, users=users
        )

        if user_email_notifications_enabled(user):
            send_coair_email(
                "login_alert",
                recipient_address(username),
                name=display,
                company_name=company_name,
                description="You just signed in to COAir.",
            )

        if (
            owner
            and owner.lower() != username.lower()
            and user_email_notifications_enabled(owner_user)
        ):
            send_coair_email(
                "login_alert",
                recipient_address(owner),
                name=str((owner_user or {}).get("display_name") or owner),
                company_name=company_name,
                description=f"{display} ({username}) signed in to COAir.",
            )
        elif not membership:
            logger.info("login_email_no_org user=%s", username)
    except Exception as exc:
        logger.warning("login_email_failed user=%s err=%s", username, exc)


def notify_password_reset(
    username: str,
    *,
    record: Optional[Dict[str, Any]] = None,
    orgs: Optional[OrgStore] = None,
    users: Optional[UserStore] = None,
) -> None:
    """Notify company admin that a member requested a password reset.

    The reset link itself is already emailed to the requesting user.
    """
    try:
        users = users or get_user_store()
        orgs = orgs or get_org_store()
        user = record or users.get_user(username) or {}
        display = str(user.get("display_name") or username)
        _membership, company_name, owner, owner_user = _org_context(
            username, orgs=orgs, users=users
        )
        if not owner or owner.lower() == username.lower():
            return
        if not user_email_notifications_enabled(owner_user):
            logger.info(
                "password_reset_admin_skipped prefs_off owner=%s user=%s",
                owner,
                username,
            )
            return
        send_coair_email(
            "password_reset_alert",
            recipient_address(owner),
            name=str((owner_user or {}).get("display_name") or owner),
            company_name=company_name,
            description=f"{display} ({username}) requested a password reset.",
        )
    except Exception as exc:
        logger.warning(
            "password_reset_admin_email_failed user=%s err=%s", username, exc
        )
