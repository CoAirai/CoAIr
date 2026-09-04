"""Public company access requests. Approval lives on the admin commerce router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from src.commerce_store import CommerceStore, get_commerce_store
from src.email_delivery import send_coair_email


router = APIRouter()


class AccessRequestCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    email: str = Field(min_length=3, max_length=160)
    company_name: str = Field(min_length=1, max_length=160)


@router.post("/access-requests", status_code=201)
async def create_access_request(
    req: AccessRequestCreate,
    request: Request,
    store: CommerceStore = Depends(get_commerce_store),
):
    from backend.core.platform_guard import client_ip, rate_limit

    ip = client_ip(request) or "unknown"
    email = req.email.strip().lower()
    rate_limit(f"access:{ip}", limit=5, window_seconds=60)
    rate_limit(f"access:email:{email}", limit=3, window_seconds=3600)
    try:
        created = store.create_access_request(
            full_name=req.full_name,
            email=req.email,
            company_name=req.company_name,
        )
    except ValueError as exc:
        code = str(exc)
        status = 409 if code == "pending_request_exists" else 400
        raise HTTPException(status, code) from exc
    send_coair_email(
        "access_request_received",
        email,
        name=req.full_name,
        company_name=req.company_name,
    )
    return created
