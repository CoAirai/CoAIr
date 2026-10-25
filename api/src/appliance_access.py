"""Local account provisioning; existing cloud/legacy accounts are unchanged."""
import os
from datetime import datetime, timedelta, timezone

STORAGE_BYTES = 5_000_000_000
PLANS = {"demo": 1_000_000, "office": 100_000}


def provision_personal_access(users, orgs, username, plan=None):
    from .project_store import get_project_store
    from .config import EMBEDDING_PROVIDER
    plan = plan or os.getenv("COAIR_ACCESS_PLAN", "demo")
    if plan not in PLANS:
        raise ValueError("invalid access plan")
    member = orgs.membership_for(username)
    if not member:
        raise ValueError("organization membership required")
    record = users.get_user(username)
    projects = get_project_store()
    project_id = record.get("personal_project_id")
    if not project_id:
        project = projects.create_project(
            name=f"Personal — {record['display_name']}", owner=username,
            org_id=member["org_id"],
            embedding_profile="gemini-embedding-2" if EMBEDDING_PROVIDER == "gemini" else "local-bge-v1",
        )
        project_id = project["project_id"]
    fields = dict(access_plan=plan, personal_project_id=project_id,
                  token_limit=PLANS[plan], is_active=record['is_active'] if record.get('access_plan') else True,
                  must_change_password=bool(record.get("must_change_password") or not record.get("access_plan")))
    if record.get("access_plan") != plan:
        fields["expires_at"] = (
            (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
            if plan == "demo" else None
        )
    users.update_user(username, **fields)
    users.billing.update_account(username, storage_limit_bytes=STORAGE_BYTES)
    return users.get_user(username)
