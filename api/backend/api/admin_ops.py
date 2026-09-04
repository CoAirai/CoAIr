"""Platform-operator audit, billing, dunning, overage, and security."""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.security import UserContext, require_admin
from src.ops_store import OpsStore, get_ops_store
from src.org_store import OrgStore, get_org_store
from src.user_store import UserStore, get_user_store


router = APIRouter()


class InvoiceCreate(BaseModel):
    org_id: str = Field(min_length=1, max_length=64)
    amount_usd: float = Field(gt=0)
    status: Literal["paid", "open", "past_due", "refunded"] = "open"
    description: str = Field(default="", max_length=200)


class RefundRequest(BaseModel):
    reason: str = Field(default="", max_length=400)


class CouponCreate(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    discount_type: Literal["percent", "fixed"] = "percent"
    discount_value: float = Field(gt=0)


class TaxUpdate(BaseModel):
    percent: float = Field(ge=0)
    region_label: str = Field(default="Default", max_length=80)


class OverageUpdate(BaseModel):
    mode: Literal["block", "throttle", "bill"]
    trigger_pct: float = Field(gt=0)
    notes: str = Field(default="", max_length=500)


class SecurityUpdate(BaseModel):
    mfa_required: Optional[bool] = None
    session_timeout_minutes: Optional[int] = None


class IpAdd(BaseModel):
    entry: str = Field(min_length=1, max_length=80)


class ApiKeyCreate(BaseModel):
    label: str = Field(min_length=1, max_length=80)


class FlagUpdate(BaseModel):
    enabled: bool


class MaintenanceUpdate(BaseModel):
    mode: bool
    message: str = Field(default="", max_length=500)


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=4000)


def _http(exc: ValueError) -> HTTPException:
    code = str(exc)
    status = 404 if code.endswith("not_found") else 400
    if code in ("coupon_exists", "topup_already_resolved"):
        status = 409
    return HTTPException(status, code)


@router.get("/admin/audit")
async def list_audit(
    action: str = "all",
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    return {"events": ops.list_audit(None if action == "all" else action)}


@router.get("/admin/invoices")
async def list_admin_invoices(
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    return {"invoices": ops.list_invoices()}


@router.get("/admin/invoices/{invoice_id}")
async def get_admin_invoice(
    invoice_id: str,
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    invoice = ops.get_invoice(invoice_id)
    if not invoice:
        raise HTTPException(404, "invoice_not_found")
    return invoice


@router.post("/admin/invoices", status_code=201)
async def create_admin_invoice(
    req: InvoiceCreate,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
    orgs: OrgStore = Depends(get_org_store),
):
    if not orgs.get_org(req.org_id):
        raise HTTPException(404, "organization_not_found")
    invoice = ops.create_invoice(
        req.org_id,
        amount_usd=req.amount_usd,
        status=req.status,
        description=req.description,
    )
    ops.record_audit(
        actor=admin.username,
        action="billing.retry_invoice",
        target_type="invoice",
        target_id=invoice["id"],
        target_label=invoice["id"],
        detail=f"Created invoice ${req.amount_usd:.2f} ({req.status})",
    )
    try:
        from src.billing_notify import notify_org_billing

        kind = "invoice_paid" if req.status == "paid" else "invoice_issued"
        notify_org_billing(
            req.org_id,
            kind,
            invoice=invoice,
            description=req.description or "",
            orgs=orgs,
        )
    except Exception:
        pass
    return invoice


@router.post("/admin/invoices/{invoice_id}/retry")
async def retry_invoice(
    invoice_id: str,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    current = ops.get_invoice(invoice_id)
    if not current:
        raise HTTPException(404, "invoice_not_found")
    next_status = "open" if current["status"] == "past_due" else current["status"]
    updated = ops.update_invoice_status(invoice_id, next_status)
    ops.record_audit(
        actor=admin.username,
        action="billing.retry_invoice",
        target_type="invoice",
        target_id=invoice_id,
        target_label=invoice_id,
        detail=f"Retried payment — {current['status']} → {updated['status']}",
    )
    return updated


@router.post("/admin/invoices/{invoice_id}/refund")
async def refund_invoice(
    invoice_id: str,
    req: RefundRequest,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        updated = ops.update_invoice_status(invoice_id, "refunded")
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="billing.refund",
        target_type="invoice",
        target_id=invoice_id,
        target_label=invoice_id,
        detail=f"Refunded ${updated['amount_usd']:.2f} — {req.reason or 'no reason'}",
    )
    try:
        from src.billing_notify import notify_org_billing

        notify_org_billing(
            str(updated.get("company_id") or ""),
            "invoice_refunded",
            invoice=updated,
            description=req.reason or "Refund issued",
        )
    except Exception:
        pass
    return updated


@router.get("/admin/coupons")
async def list_coupons(
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    return {"coupons": ops.list_coupons()}


@router.post("/admin/coupons", status_code=201)
async def create_coupon(
    req: CouponCreate,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        coupon = ops.create_coupon(
            code=req.code,
            discount_type=req.discount_type,
            discount_value=req.discount_value,
        )
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="billing.coupon_create",
        target_type="coupon",
        target_id=coupon["id"],
        target_label=coupon["code"],
        detail=f"Created {coupon['discount_type']} {coupon['discount_value']}",
    )
    return coupon


@router.post("/admin/coupons/{coupon_id}/toggle")
async def toggle_coupon(
    coupon_id: str,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        coupon = ops.toggle_coupon(coupon_id)
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="billing.coupon_toggle",
        target_type="coupon",
        target_id=coupon["id"],
        target_label=coupon["code"],
        detail="Toggled coupon",
    )
    return coupon


@router.get("/admin/tax")
async def read_tax(
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    return ops.get_tax()


@router.put("/admin/tax")
async def write_tax(
    req: TaxUpdate,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    tax = ops.set_tax(percent=req.percent, region_label=req.region_label)
    ops.record_audit(
        actor=admin.username,
        action="billing.tax_update",
        target_type="invoice",
        target_id="tax",
        target_label=tax["region_label"],
        detail=f"Tax {tax['percent']}%",
    )
    return tax


@router.get("/admin/overage-policy")
async def read_overage(
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    return ops.get_overage_policy()


@router.put("/admin/overage-policy")
async def write_overage(
    req: OverageUpdate,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        policy = ops.set_overage_policy(
            mode=req.mode, trigger_pct=req.trigger_pct, notes=req.notes,
        )
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="ops.flag",
        target_type="ops",
        target_id="overage",
        target_label="Overage policy",
        detail=(
            f"{policy['mode']} at {policy['trigger_pct']}% "
            "(tokens + storage)"
        ),
    )
    return policy


@router.get("/admin/dunning")
async def list_dunning(
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    return {"cases": ops.list_dunning()}


@router.post("/admin/dunning/{case_id}/retry")
async def retry_dunning(
    case_id: str,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        case = ops.retry_dunning(case_id)
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="billing.retry_invoice",
        target_type="invoice",
        target_id=case_id,
        target_label=case["company_id"],
        detail="Retried dunning collection",
    )
    return case


@router.post("/admin/dunning/{case_id}/extend")
async def extend_dunning(
    case_id: str,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        case = ops.extend_dunning(case_id, 7)
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="company.activate",
        target_type="company",
        target_id=case["company_id"],
        target_label=case["company_id"],
        detail="Extended dunning grace +7 days",
    )
    return case


@router.get("/admin/security")
async def read_security(
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    return {**ops.get_security(), "api_keys": ops.list_api_keys()}


@router.put("/admin/security")
async def write_security(
    req: SecurityUpdate,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        security = ops.set_security(
            mfa_required=req.mfa_required,
            session_timeout_minutes=req.session_timeout_minutes,
        )
    except ValueError as exc:
        raise _http(exc) from exc
    if req.mfa_required is not None:
        ops.record_audit(
            actor=admin.username,
            action="security.mfa",
            target_type="security",
            target_id="mfa",
            target_label="MFA",
            detail="Required" if req.mfa_required else "Optional",
        )
    if req.session_timeout_minutes is not None:
        ops.record_audit(
            actor=admin.username,
            action="security.session_timeout",
            target_type="security",
            target_id="session",
            target_label="Session timeout",
            detail=f"{req.session_timeout_minutes} minutes",
        )
    return {**security, "api_keys": ops.list_api_keys()}


@router.post("/admin/security/ip-allowlist")
async def add_ip(
    req: IpAdd,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        security = ops.add_ip(req.entry)
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="security.ip_add",
        target_type="security",
        target_id=req.entry,
        target_label=req.entry,
        detail="Added IP allowlist entry",
    )
    return security


@router.delete("/admin/security/ip-allowlist")
async def remove_ip(
    entry: str,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    security = ops.remove_ip(entry)
    ops.record_audit(
        actor=admin.username,
        action="security.ip_remove",
        target_type="security",
        target_id=entry,
        target_label=entry,
        detail="Removed IP allowlist entry",
    )
    return security


@router.post("/admin/security/api-keys", status_code=201)
async def create_api_key(
    req: ApiKeyCreate,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        key = ops.create_api_key(req.label)
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="security.api_key_create",
        target_type="api_key",
        target_id=key["id"],
        target_label=key["label"],
        detail="Created API key",
    )
    return key


@router.post("/admin/security/api-keys/{key_id}/revoke")
async def revoke_api_key(
    key_id: str,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        key = ops.revoke_api_key(key_id)
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="security.api_key_revoke",
        target_type="api_key",
        target_id=key_id,
        target_label=key["label"],
        detail="Revoked API key",
    )
    return key


@router.get("/admin/flags")
async def list_flags(
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    return {"flags": ops.list_flags()}


@router.put("/admin/flags/{flag_id}")
async def update_flag(
    flag_id: str,
    req: FlagUpdate,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        flag = ops.set_flag_enabled(flag_id, req.enabled)
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="ops.flag",
        target_type="flag",
        target_id=flag["id"],
        target_label=flag["key"],
        detail=f"{flag['label']} {'enabled' if flag['enabled'] else 'disabled'}",
    )
    return flag


@router.get("/admin/maintenance")
async def read_maintenance(
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    return ops.get_maintenance()


@router.put("/admin/maintenance")
async def write_maintenance(
    req: MaintenanceUpdate,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    current = ops.set_maintenance(mode=req.mode, message=req.message)
    ops.record_audit(
        actor=admin.username,
        action="ops.maintenance",
        target_type="platform",
        target_id="maintenance",
        target_label="maintenance",
        detail=(
            f"Maintenance {'on' if current['mode'] else 'off'}"
            + (f" — {current['message']}" if current["message"] else "")
        ),
    )
    return current


@router.get("/admin/announcements")
async def list_announcements(
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    return {"announcements": ops.list_announcements()}


@router.post("/admin/announcements", status_code=201)
async def create_announcement(
    req: AnnouncementCreate,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        announcement = ops.create_announcement(title=req.title, body=req.body)
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="ops.announcement",
        target_type="announcement",
        target_id=announcement["id"],
        target_label=announcement["title"],
        detail="Created draft announcement",
    )
    return announcement


@router.post("/admin/announcements/{announcement_id}/publish")
async def publish_announcement(
    announcement_id: str,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        announcement = ops.set_announcement_status(announcement_id, "published")
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="ops.announcement",
        target_type="announcement",
        target_id=announcement["id"],
        target_label=announcement["title"],
        detail="Published announcement",
    )
    return announcement


@router.post("/admin/announcements/{announcement_id}/archive")
async def archive_announcement(
    announcement_id: str,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        announcement = ops.set_announcement_status(announcement_id, "archived")
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="ops.announcement",
        target_type="announcement",
        target_id=announcement["id"],
        target_label=announcement["title"],
        detail="Archived announcement",
    )
    return announcement


@router.get("/admin/topups")
async def list_admin_topups(
    status: str = "all",
    _admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    filter_status = None if status in ("", "all") else status
    return {"requests": ops.list_topups(status=filter_status)}


def _credit_topup(
    *,
    request: dict,
    users: UserStore,
    orgs: OrgStore,
    ops: OpsStore,
) -> None:
    members = orgs.list_members(request["company_id"])
    owner = next((member for member in members if member["role"] == "owner"), None)
    if not owner:
        raise HTTPException(409, "org_has_no_owner")
    credits = float(request["amount_usd"] or 0)
    if credits <= 0:
        credits = max(int(request["tokens_requested"]) / 1000, 0.01)
    users.billing.adjust_credits(
        owner["username"],
        credits,
        f"Approved top-up {request['id']}: {request['tokens_requested']} tokens",
        idempotency_key=f"topup:{request['id']}",
    )
    record = users.get_user(owner["username"])
    if record:
        users.update_user(
            owner["username"],
            token_limit=int(record["token_limit"]) + int(request["tokens_requested"]),
        )
    ops.create_invoice(
        request["company_id"],
        amount_usd=float(request["amount_usd"] or credits),
        status="paid",
        description=f"Token top-up {request['tokens_requested']}",
    )


@router.post("/admin/topups/{request_id}/approve")
async def approve_topup(
    request_id: str,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
    orgs: OrgStore = Depends(get_org_store),
    users: UserStore = Depends(get_user_store),
):
    current = ops.get_topup(request_id)
    if not current:
        raise HTTPException(404, "topup_not_found")
    if current["status"] != "pending":
        raise HTTPException(409, "topup_already_resolved")
    try:
        _credit_topup(request=current, users=users, orgs=orgs, ops=ops)
        updated = ops.resolve_topup(request_id, "approved", admin.username)
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="tokens.topup_approve",
        target_type="topup",
        target_id=updated["id"],
        target_label=updated["id"],
        detail=f"Approved {updated['tokens_requested']} tokens for {updated['company_id']}",
    )
    return updated


@router.post("/admin/topups/{request_id}/deny")
async def deny_topup(
    request_id: str,
    admin: UserContext = Depends(require_admin),
    ops: OpsStore = Depends(get_ops_store),
):
    try:
        updated = ops.resolve_topup(request_id, "denied", admin.username)
    except ValueError as exc:
        raise _http(exc) from exc
    ops.record_audit(
        actor=admin.username,
        action="tokens.topup_deny",
        target_type="topup",
        target_id=updated["id"],
        target_label=updated["id"],
        detail=f"Denied {updated['tokens_requested']} tokens for {updated['company_id']}",
    )
    return updated
