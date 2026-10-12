"""Local notices and browser push subscriptions.

These stay in a SQLite file under storage so they do not need a Supabase
migration. The file is per API server, which is the one process that finishes
indexing, chronology, and FORENSIS.
"""

from __future__ import annotations

import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.config import STORAGE_DIR

_DB_PATH = Path(STORAGE_DIR) / "activity_notices.db"
_lock = threading.Lock()
_ready = False

_SCHEMA = """
CREATE TABLE IF NOT EXISTS notices (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    href        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    read_at     TEXT
);
CREATE INDEX IF NOT EXISTS notices_user_created
    ON notices (username, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint    TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user
    ON push_subscriptions (username);
"""


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _connect() -> sqlite3.Connection:
    global _ready
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), timeout=20)
    conn.row_factory = sqlite3.Row
    if not _ready:
        conn.executescript(_SCHEMA)
        _ready = True
    return conn


def add_notice(username: str, title: str, body: str, href: str) -> Dict[str, Any]:
    notice = {
        "id": uuid.uuid4().hex,
        "username": username.strip().lower(),
        "title": title.strip()[:140] or "COAir",
        "body": body.strip()[:280],
        "href": href if href.startswith("/") and not href.startswith("//") else "/workspace",
        "created_at": _now(),
        "read_at": None,
    }
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                """
                INSERT INTO notices (id, username, title, body, href, created_at, read_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    notice["id"],
                    notice["username"],
                    notice["title"],
                    notice["body"],
                    notice["href"],
                    notice["created_at"],
                ),
            )
            conn.execute(
                """
                DELETE FROM notices
                WHERE username = ?
                  AND id NOT IN (
                    SELECT id FROM notices
                    WHERE username = ?
                    ORDER BY created_at DESC
                    LIMIT 40
                  )
                """,
                (notice["username"], notice["username"]),
            )
            conn.commit()
        finally:
            conn.close()
    return notice


def list_notices(username: str, limit: int = 30) -> List[Dict[str, Any]]:
    key = username.strip().lower()
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT id, title, body, href, created_at, read_at
                FROM notices
                WHERE username = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (key, max(1, min(limit, 40))),
            ).fetchall()
        finally:
            conn.close()
    return [dict(row) for row in rows]


def mark_notices_read(username: str, ids: Optional[List[str]] = None) -> None:
    key = username.strip().lower()
    stamp = _now()
    with _lock:
        conn = _connect()
        try:
            if ids:
                clean = [item for item in ids if isinstance(item, str) and item][:40]
                if not clean:
                    return
                marks = ",".join("?" for _ in clean)
                conn.execute(
                    f"""
                    UPDATE notices
                    SET read_at = ?
                    WHERE username = ? AND read_at IS NULL AND id IN ({marks})
                    """,
                    [stamp, key, *clean],
                )
            else:
                conn.execute(
                    """
                    UPDATE notices
                    SET read_at = ?
                    WHERE username = ? AND read_at IS NULL
                    """,
                    (stamp, key),
                )
            conn.commit()
        finally:
            conn.close()


def save_push_subscription(
    username: str, endpoint: str, p256dh: str, auth: str
) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                """
                INSERT INTO push_subscriptions (endpoint, username, p256dh, auth, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(endpoint) DO UPDATE SET
                    username = excluded.username,
                    p256dh = excluded.p256dh,
                    auth = excluded.auth
                """,
                (
                    endpoint,
                    username.strip().lower(),
                    p256dh,
                    auth,
                    _now(),
                ),
            )
            conn.commit()
        finally:
            conn.close()


def delete_push_subscription(username: str, endpoint: str) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                """
                DELETE FROM push_subscriptions
                WHERE username = ? AND endpoint = ?
                """,
                (username.strip().lower(), endpoint),
            )
            conn.commit()
        finally:
            conn.close()


def list_push_subscriptions(username: str) -> List[Dict[str, str]]:
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT endpoint, p256dh, auth
                FROM push_subscriptions
                WHERE username = ?
                """,
                (username.strip().lower(),),
            ).fetchall()
        finally:
            conn.close()
    return [dict(row) for row in rows]


def delete_push_endpoint(endpoint: str) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                "DELETE FROM push_subscriptions WHERE endpoint = ?",
                (endpoint,),
            )
            conn.commit()
        finally:
            conn.close()
