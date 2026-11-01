"""Opt-in verified demo invitations. Does not enable Internet ingress."""
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from fastapi import HTTPException


def enabled():
    return os.getenv("COAIR_DEMO_INVITES_ENABLED", "0") == "1"


def require_delivery_configuration():
    from src.email_delivery import user_app_origin
    origin = user_app_origin()
    parsed = urlsplit(origin)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise HTTPException(503, "demo_https_not_configured")
    if not os.getenv("RESEND_API_KEY", "").strip():
        raise HTTPException(503, "demo_email_not_configured")
    return origin


def check_capacity(orgs, org_id, email):
    # Retained expired accounts still hold documents and count towards capacity.
    maximum = max(1, int(os.getenv("COAIR_DEMO_MAX_ACCOUNTS", "10")))
    members = orgs.list_members(org_id)
    if email not in {m["username"] for m in members} and len(members) >= maximum:
        raise HTTPException(409, "demo_account_capacity_reached")


def activate_local_demo(users, orgs, email):
    from src.appliance_access import provision_personal_access
    from src.user_store import ACCOUNT_ACTIVE
    provision_personal_access(users, orgs, email, plan="demo")
    users.update_user(email, account_status=ACCOUNT_ACTIVE, is_active=True,
                      must_change_password=False,
                      expires_at=(datetime.now(timezone.utc) + timedelta(days=7)).isoformat())
