"""Deliver a finished piece of work to the Responses list and to browser push."""

from __future__ import annotations

from src.activity_store import (
    add_notice,
    delete_push_endpoint,
    list_push_subscriptions,
)
from src.logger import logger
from src.user_store import get_user_store
from src.web_push import send_web_push


def _features(username: str) -> dict:
    user = get_user_store().get_user(username)
    return dict((user or {}).get("features") or {})


def deliver_activity(
    username: str,
    title: str,
    body: str,
    href: str = "/workspace",
) -> None:
    """Record an in-app response and send a browser push when those switches are on."""
    try:
        username = (username or "").strip()
        if "@" not in username:
            return
        features = _features(username)
        if bool(features.get("notify_responses", True)):
            add_notice(username, title, body, href)
        if not bool(features.get("notify_push", True)):
            return
        payload = {
            "title": title.strip()[:140] or "COAir",
            "body": body.strip()[:280],
            "href": href if str(href).startswith("/") else "/workspace",
        }
        for subscription in list_push_subscriptions(username):
            result = send_web_push(subscription, payload)
            if result == "gone":
                delete_push_endpoint(subscription["endpoint"])
    except Exception:
        logger.exception("deliver_activity_failed")
