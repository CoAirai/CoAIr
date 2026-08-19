"""Company support tickets — owners open them, Super Admin triages them."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.orgs import OrgContext, require_org_owner
from backend.core.security import UserContext, get_current_user
from src.commerce_store import CommerceStore, get_commerce_store


router = APIRouter()


class TicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=8000)
    priority: Literal["low", "medium", "high"] = "medium"


@router.get("/tickets")
async def list_tickets(
    org: OrgContext = Depends(require_org_owner),
    store: CommerceStore = Depends(get_commerce_store),
):
    return {"tickets": store.list_tickets(org.org_id)}


@router.post("/tickets", status_code=201)
async def create_ticket(
    req: TicketCreate,
    org: OrgContext = Depends(require_org_owner),
    user: UserContext = Depends(get_current_user),
    store: CommerceStore = Depends(get_commerce_store),
):
    try:
        return store.create_ticket(
            org.org_id,
            subject=req.subject,
            message=req.message,
            priority=req.priority,
            created_by=user.username,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
