"""In-app responses and browser push subscriptions."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.security import UserContext, get_current_user
from src.activity_notify import deliver_activity
from src.activity_store import (
    delete_push_subscription,
    list_notices,
    mark_notices_read,
    save_push_subscription,
)
from src.web_push import vapid_public_key

router = APIRouter()


class NoticeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    body: str = Field(default="", max_length=280)
    href: str = Field(default="/workspace/chat", max_length=200)


class NoticeRead(BaseModel):
    ids: Optional[List[str]] = None


class PushSubscriptionBody(BaseModel):
    endpoint: str = Field(min_length=12, max_length=2000)
    p256dh: str = Field(min_length=8, max_length=200)
    auth: str = Field(min_length=8, max_length=80)


class PushUnsubscribeBody(BaseModel):
    endpoint: str = Field(min_length=12, max_length=2000)


def _safe_href(href: str) -> str:
    value = (href or "").strip()
    if not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/workspace"
    return value


@router.get("/notices")
async def get_notices(user: UserContext = Depends(get_current_user)):
    rows = list_notices(user.username)
    unread = sum(1 for row in rows if not row.get("read_at"))
    return {"notices": rows, "unread": unread}


@router.post("/notices")
async def create_notice(
    req: NoticeCreate,
    user: UserContext = Depends(get_current_user),
):
    """Used when a QUERIS answer finishes after the person has left the tab."""
    deliver_activity(
        user.username,
        req.title.strip(),
        req.body.strip(),
        _safe_href(req.href),
    )
    return {"ok": True}


@router.post("/notices/read")
async def read_notices(
    req: NoticeRead,
    user: UserContext = Depends(get_current_user),
):
    mark_notices_read(user.username, req.ids)
    return {"ok": True}


@router.get("/push/vapid")
async def push_vapid_key(user: UserContext = Depends(get_current_user)):
    return {"publicKey": vapid_public_key()}


@router.put("/push/subscription")
async def put_push_subscription(
    req: PushSubscriptionBody,
    user: UserContext = Depends(get_current_user),
):
    endpoint = req.endpoint.strip()
    if not endpoint.startswith("https://"):
        raise HTTPException(400, "invalid_push_endpoint")
    save_push_subscription(user.username, endpoint, req.p256dh.strip(), req.auth.strip())
    return {"ok": True}


@router.post("/push/unsubscribe")
async def remove_push_subscription(
    req: PushUnsubscribeBody,
    user: UserContext = Depends(get_current_user),
):
    delete_push_subscription(user.username, req.endpoint.strip())
    return {"ok": True}
