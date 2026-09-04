"""Platform-operator tickets, packages, sell rate, and access-request queue."""

from __future__ import annotations

import secrets
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.security import UserContext, require_admin
from src.commerce_store import CommerceStore, get_commerce_store, plan_org_defaults
from src.email_delivery import send_coair_email
from src.org_store import OrgStore, get_org_store
from src.supabase_auth import invite_or_recover, use_supabase_auth
from src.user_store import UserStore, get_user_store


router = APIRouter()


class TicketPatch(BaseModel):
    assignee_id: Optional[str] = Field(default=None, max_length=80)
    status: Optional[Literal["open", "resolved"]] = None


class PackagePatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    price_label: Optional[str] = Field(default=None, max_length=80)
    users_included: Optional[int] = Field(default=None, ge=0)
    storage_limit_gb: Optional[int] = Field(default=None, ge=0)
    api_credits_usd: Optional[int] = Field(default=None, ge=0)
    query_cap: Optional[int] = Field(default=None, ge=0)
    modules: Optional[Dict[str, Dict[str, Any]]] = None


class TokenEconomicsUpdate(BaseModel):
    provider_tokens_per_usd: float = Field(gt=0)
    sell_tokens_per_usd: float = Field(gt=0)


@router.get("/admin/tickets")
async def list_admin_tickets(
    _admin: UserContext = Depends(require_admin),
    store: CommerceStore = Depends(get_commerce_store),
):
    return {"tickets": store.list_tickets()}


@router.patch("/admin/tickets/{ticket_id}")
async def patch_admin_ticket(
    ticket_id: str,
    req: TicketPatch,
    _admin: UserContext = Depends(require_admin),
    store: CommerceStore = Depends(get_commerce_store),
):
    fields = getattr(req, "model_fields_set", None) or getattr(req, "__fields_set__", set())
    unassign = False
    assignee = req.assignee_id
    if "assignee_id" in fields:
        if req.assignee_id is None or not str(req.assignee_id).strip():
            unassign = True
            assignee = None
    try:
        updated = store.update_ticket(
            ticket_id,
            assignee_id=assignee,
            status=req.status,
            unassign=unassign,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not updated:
        raise HTTPException(404, "ticket_not_found")
    return updated


@router.patch("/admin/packages/{plan_id}")
async def patch_package(
    plan_id: str,
    req: PackagePatch,
    _admin: UserContext = Depends(require_admin),
    store: CommerceStore = Depends(get_commerce_store),
):
    try:
        return store.update_plan(plan_id, req.model_dump(exclude_unset=True))
    except ValueError as exc:
        code = str(exc)
        status = 404 if code == "plan_not_found" else 400
        raise HTTPException(status, code) from exc


@router.get("/admin/token-economics")
async def read_token_economics(
    _admin: UserContext = Depends(require_admin),
    store: CommerceStore = Depends(get_commerce_store),
):
    return store.get_token_economics()


@router.put("/admin/token-economics")
async def write_token_economics(
    req: TokenEconomicsUpdate,
    admin: UserContext = Depends(require_admin),
    store: CommerceStore = Depends(get_commerce_store),
):
    try:
        return store.update_token_economics(
            provider_tokens_per_usd=req.provider_tokens_per_usd,
            sell_tokens_per_usd=req.sell_tokens_per_usd,
            updated_by=admin.username,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/admin/access-requests")
async def list_access_requests(
    _admin: UserContext = Depends(require_admin),
    store: CommerceStore = Depends(get_commerce_store),
):
    return {"requests": store.list_access_requests()}


@router.post("/admin/access-requests/{request_id}/approve")
async def approve_access_request(
    request_id: str,
    admin: UserContext = Depends(require_admin),
    commerce: CommerceStore = Depends(get_commerce_store),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
):
    request = commerce.get_access_request(request_id)
    if not request:
        raise HTTPException(404, "request_not_found")
    if request["status"] != "pending":
        raise HTTPException(409, "request_not_pending")
    username = request["email"]
    if users.get_user(username):
        raise HTTPException(409, "email_already_registered")
    demo = plan_org_defaults("demo")
    password = secrets.token_urlsafe(12)
    storage_bytes = demo["default_storage_bytes"]
    credits = demo["default_credits"]
    users.create_user(
        username,
        password,
        display_name=request["full_name"],
        role="user",
        plan_type="demo",
        initial_credits=credits,
        storage_limit_bytes=storage_bytes,
    )
    try:
        org = orgs.create_org(
            request["company_name"],
            created_by=admin.username,
            owner=username,
            default_plan_type="demo",
            default_credits=credits,
            default_storage_bytes=storage_bytes,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    resolved = commerce.resolve_access_request(request_id, "approved", plan_id="demo")
    subscription = commerce.set_subscription(
        org["org_id"], plan_id="demo", needs_checkout=True,
    )
    invited = False
    emailed = False
    if use_supabase_auth():
        try:
            uid = invite_or_recover(username, username, password=password)
            if uid:
                users.set_supabase_user_id(username, uid)
            invited = True
        except RuntimeError as exc:
            raise HTTPException(502, "supabase_sync_failed") from exc
    mail = send_coair_email(
        "access_approved",
        username,
        name=request["full_name"],
        company_name=request["company_name"],
    )
    owner_mail = send_coair_email(
        "owner_invite",
        username,
        name=request["full_name"],
        company_name=request["company_name"],
        temporary_password=password,
    )
    emailed = (
        mail.get("ok") and mail.get("mode") == "live"
    ) or (
        owner_mail.get("ok") and owner_mail.get("mode") == "live"
    )
    return {
        "request": resolved,
        "org": org,
        "subscription": subscription,
        "owner": {
            "username": username,
            "invited": invited or emailed,
            "temporary_password": "" if emailed else password,
        },
    }


@router.post("/admin/access-requests/{request_id}/deny")
async def deny_access_request(
    request_id: str,
    _admin: UserContext = Depends(require_admin),
    store: CommerceStore = Depends(get_commerce_store),
):
    request = store.get_access_request(request_id)
    if not request:
        raise HTTPException(404, "request_not_found")
    if request["status"] != "pending":
        raise HTTPException(409, "request_not_pending")
    try:
        resolved = store.resolve_access_request(request_id, "denied")
    except ValueError as exc:
        code = str(exc)
        status = 404 if code == "request_not_found" else 409
        raise HTTPException(status, code) from exc
    send_coair_email(
        "access_denied",
        request["email"],
        name=request["full_name"],
        company_name=request["company_name"],
    )
    return resolved
