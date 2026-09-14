"""Super Admin routes for virtual Gemini provider sub-keys."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.security import UserContext, require_admin
from src.billing_store import get_billing_store
from src.ops_store import get_ops_store
from src.org_store import get_org_store
from src.provider_credentials import validate_provider_key_ref


router = APIRouter()


class ProviderKeyCreate(BaseModel):
    label: str = Field(min_length=1, max_length=160)


class OrgProviderKeyUpdate(BaseModel):
    key_ref: Optional[str] = Field(default=None, max_length=64)


def _with_usage_and_org(key: Dict[str, Any], usage: Dict[str, Any], org: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        **key,
        "assigned_org": (
            {
                "org_id": org["org_id"],
                "name": org["name"],
            }
            if org
            else None
        ),
        "usage": {
            "calls": int(usage.get("calls") or 0),
            "prompt_tokens": int(usage.get("prompt_tokens") or 0),
            "completion_tokens": int(usage.get("completion_tokens") or 0),
            "provider_cost_usd": float(usage.get("provider_cost_usd") or 0),
            "ca_tokens": float(usage.get("ca_tokens") or 0),
        },
    }


@router.get("/admin/provider-keys")
def list_provider_keys(_admin: UserContext = Depends(require_admin)) -> dict:
    ops = get_ops_store()
    orgs = get_org_store()
    billing = get_billing_store()
    keys = ops.list_provider_keys(include_revoked=True)
    refs = [k["key_ref"] for k in keys]
    usage_map = billing.usage_by_provider_keys(refs)
    rows = []
    for key in keys:
        org = orgs.find_org_by_provider_key_ref(key["key_ref"])
        rows.append(_with_usage_and_org(key, usage_map.get(key["key_ref"], {}), org))
    return {"keys": rows}


@router.post("/admin/provider-keys")
def create_provider_key(
    body: ProviderKeyCreate,
    admin: UserContext = Depends(require_admin),
) -> dict:
    try:
        key = get_ops_store().create_provider_key(
            label=body.label,
            created_by=admin.username,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return _with_usage_and_org(key, {}, None)


@router.post("/admin/provider-keys/{key_ref}/revoke")
def revoke_provider_key(
    key_ref: str,
    _admin: UserContext = Depends(require_admin),
) -> dict:
    ops = get_ops_store()
    orgs = get_org_store()
    key = ops.revoke_provider_key(key_ref)
    if not key:
        raise HTTPException(404, "provider_key_not_found")
    orgs.clear_provider_key_assignments(key_ref)
    usage = get_billing_store().usage_by_provider_keys([key_ref]).get(key_ref, {})
    return _with_usage_and_org(key, usage, None)


@router.put("/admin/orgs/{org_id}/provider-key")
def assign_org_provider_key(
    org_id: str,
    body: OrgProviderKeyUpdate,
    _admin: UserContext = Depends(require_admin),
) -> dict:
    orgs = get_org_store()
    ops = get_ops_store()
    if not orgs.get_org(org_id):
        raise HTTPException(404, "organization_not_found")
    raw = body.key_ref
    if raw is None or str(raw).strip() == "":
        updated = orgs.assign_provider_key(org_id, None)
        return {"org": updated}
    try:
        ref = validate_provider_key_ref(str(raw))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    registered = ops.get_provider_key(ref)
    if not registered:
        raise HTTPException(404, "provider_key_not_found")
    if registered.get("status") != "active":
        raise HTTPException(400, "provider_key_revoked")
    updated = orgs.assign_provider_key(org_id, ref)
    return {"org": updated}
