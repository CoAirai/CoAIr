"""
User store — SQLite-backed user accounts, per-user token quota, feature flags.

Schema lives in `storage/users.db`. One row per user, one row per usage counter.
Password hashes use bcrypt. Auth itself happens in backend/core/security.py.
"""
from __future__ import annotations

import json
import os
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

import bcrypt

from .config import STORAGE_DIR
from .database import DbIntegrityError, DbRow, connect, table_columns, use_postgres
from .logger import logger


DB_PATH = Path(STORAGE_DIR) / "users.db"

# Role vocabulary. Defined here because this is the layer that persists it;
# backend/core/security.py re-exports these along with `is_admin()`.
SUPERADMIN_ROLE = "superadmin"
ADMIN_ROLES = ("admin", SUPERADMIN_ROLE)
VALID_ROLES = ("user",) + ADMIN_ROLES

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    UNIQUE NOT NULL,
    display_name    TEXT,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'user',
    token_limit     INTEGER NOT NULL DEFAULT 1000000,
    features_json   TEXT    NOT NULL DEFAULT '{}',
    is_active       INTEGER NOT NULL DEFAULT 1,
    token_epoch     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS user_usage (
    username          TEXT    PRIMARY KEY,
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_calls       INTEGER NOT NULL DEFAULT 0,
    updated_at        TEXT    NOT NULL,
    FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE
);
"""


class UserQuotaExceededError(RuntimeError):
    """Raised when a user has consumed their full token allowance."""

    def __init__(self, username: str, used: int, limit: int):
        self.username = username
        self.used = used
        self.limit = limit
        super().__init__(
            f"Token quota exceeded for {username}: {used} / {limit}"
        )


class UserStore:
    """SQLite-backed singleton user store. Thread-safe via per-connection locks."""

    _instance: Optional["UserStore"] = None
    _lock = threading.Lock()

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = threading.Lock()
        self._init_schema()
        from .billing_store import BillingStore
        self.billing = BillingStore(self.db_path)
        self._ensure_legacy_billing_accounts()

    @classmethod
    def instance(cls) -> "UserStore":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @contextmanager
    def _connect(self):
        with connect(self.db_path) as conn:
            yield conn

    def _init_schema(self) -> None:
        if not use_postgres():
            with self._connect() as conn:
                conn.executescript(_SCHEMA)
                columns = table_columns(conn, "users")
                if "token_epoch" not in columns:
                    conn.execute(
                        "ALTER TABLE users ADD COLUMN token_epoch INTEGER NOT NULL DEFAULT 0"
                    )
        with self._connect() as conn:
            columns = table_columns(conn, "users")
            if "supabase_user_id" not in columns:
                conn.execute("ALTER TABLE users ADD COLUMN supabase_user_id TEXT")

    def _ensure_legacy_billing_accounts(self) -> None:
        """One-shot insert for users that predate billing_accounts.

        The previous per-user loop paid a Postgres round trip per account on
        every process start, which made the first admin page miss the UI timeout.
        """
        now = datetime.utcnow().isoformat()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO billing_accounts (
                    username, plan_type, credits_granted_micro, credits_balance_micro,
                    markup_bps, storage_limit_bytes, storage_used_bytes, model_policy,
                    provider_key_ref, created_at, updated_at
                )
                SELECT u.username, 'legacy', 0, 0, 3000, 0, 0, '', '', ?, ?
                FROM users u
                WHERE NOT EXISTS (
                    SELECT 1 FROM billing_accounts b WHERE b.username = u.username
                )
                """,
                (now, now),
            )

    # ── Helpers ─────────────────────────────────────────────

    @staticmethod
    def _hash_password(plain: str) -> str:
        return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    @staticmethod
    def _verify(plain: str, hashed: str) -> bool:
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            return False

    @staticmethod
    def _row_to_user(row: DbRow) -> Dict[str, Any]:
        try:
            features = json.loads(row["features_json"] or "{}")
        except Exception:
            features = {}
        return {
            "id": row["id"],
            "username": row["username"],
            "display_name": row["display_name"] or row["username"],
            "role": row["role"],
            "token_limit": int(row["token_limit"]),
            "features": features,
            "is_active": bool(row["is_active"]),
            "token_epoch": int(row["token_epoch"]) if "token_epoch" in row.keys() else 0,
            "supabase_user_id": (
                row["supabase_user_id"] if "supabase_user_id" in row.keys() else None
            ),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    # ── CRUD ────────────────────────────────────────────────

    def create_user(
        self,
        username: str,
        password: str,
        *,
        display_name: Optional[str] = None,
        role: str = "user",
        token_limit: int = 1_000_000,
        features: Optional[Dict[str, bool]] = None,
        plan_type: str = "legacy",
        initial_credits: float = 0,
        markup_percent: float = 30,
        storage_limit_bytes: int = 0,
        model_policy: str = "",
        provider_key_ref: str = "",
    ) -> Dict[str, Any]:
        if role not in VALID_ROLES:
            raise ValueError(f"invalid role: {role!r}")
        now = datetime.utcnow().isoformat()
        features_json = json.dumps(features or {})
        with self._write_lock, self._connect() as conn:
            try:
                conn.execute(
                    """
                    INSERT INTO users
                        (username, display_name, password_hash, role,
                         token_limit, features_json, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                    """,
                    (
                        username,
                        display_name,
                        self._hash_password(password),
                        role,
                        int(token_limit),
                        features_json,
                        now,
                        now,
                    ),
                )
                conn.execute(
                    """
                    INSERT INTO user_usage
                        (username, prompt_tokens, completion_tokens, total_calls, updated_at)
                    VALUES (?, 0, 0, 0, ?)
                    """,
                    (username, now),
                )
            except DbIntegrityError as exc:
                raise ValueError(f"username already exists: {username}") from exc
        logger.info(f"[UserStore] Created user {username} (role={role})")
        self.billing.provision_account(
            username,
            plan_type=plan_type,
            initial_credits=initial_credits,
            markup_bps=round(float(markup_percent) * 100),
            storage_limit_bytes=storage_limit_bytes,
            model_policy=model_policy,
            provider_key_ref=provider_key_ref,
        )
        return self.get_user(username)

    def get_user(self, username: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE username = ?", (username,)
            ).fetchone()
        return self._row_to_user(row) if row else None

    def find_user(self, identifier: str) -> Optional[Dict[str, Any]]:
        row = self._lookup_user_row(identifier)
        return self._row_to_user(row) if row else None

    def _lookup_user_row(self, identifier: str) -> Optional[Any]:
        ident = (identifier or "").strip()
        if not ident:
            return None
        candidates = [ident]
        lower = ident.lower()
        if lower not in candidates:
            candidates.append(lower)
        domain = os.getenv("SUPABASE_AUTH_EMAIL_DOMAIN", "users.coair.local")
        suffix = f"@{domain}".lower()
        if lower.endswith(suffix):
            mapped = lower[: -len(suffix)]
            if mapped and mapped not in candidates:
                candidates.append(mapped)
        with self._connect() as conn:
            for candidate in candidates:
                row = conn.execute(
                    "SELECT * FROM users WHERE username = ?", (candidate,)
                ).fetchone()
                if row:
                    return row
        return None

    def get_user_by_supabase_id(self, supabase_user_id: str) -> Optional[Dict[str, Any]]:
        if not supabase_user_id:
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE supabase_user_id = ?",
                (supabase_user_id,),
            ).fetchone()
        return self._row_to_user(row) if row else None

    def set_supabase_user_id(self, username: str, supabase_user_id: str) -> None:
        now = datetime.utcnow().isoformat()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE users SET supabase_user_id = ?, updated_at = ? WHERE username = ?",
                (supabase_user_id, now, username),
            )

    def list_users(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM users ORDER BY created_at DESC"
            ).fetchall()
        return [self._row_to_user(r) for r in rows]

    def update_user(self, username: str, **fields: Any) -> Optional[Dict[str, Any]]:
        allowed = {
            "display_name",
            "role",
            "token_limit",
            "features",
            "is_active",
            "password",
        }
        invalid = set(fields) - allowed
        if invalid:
            raise ValueError(f"cannot update fields: {invalid}")
        # create_user has always validated this; the update path did not, so a
        # typo'd role used to be written straight through and silently stripped
        # the account of every permission (no role matches → not admin, and
        # `user` checks are positive-only).
        if "role" in fields and fields["role"] not in VALID_ROLES:
            raise ValueError(f"invalid role: {fields['role']!r}")
        sets: List[str] = []
        params: List[Any] = []
        for key, value in fields.items():
            if key == "features":
                sets.append("features_json = ?")
                params.append(json.dumps(value or {}))
            elif key == "password":
                sets.append("password_hash = ?")
                params.append(self._hash_password(value))
            elif key == "is_active":
                sets.append("is_active = ?")
                params.append(1 if value else 0)
            elif key == "token_limit":
                sets.append("token_limit = ?")
                params.append(int(value))
            else:
                sets.append(f"{key} = ?")
                params.append(value)
        if not sets:
            return self.get_user(username)
        sets.append("updated_at = ?")
        params.append(datetime.utcnow().isoformat())
        params.append(username)
        with self._write_lock, self._connect() as conn:
            cursor = conn.execute(
                f"UPDATE users SET {', '.join(sets)} WHERE username = ?", params
            )
            if cursor.rowcount == 0:
                return None
        return self.get_user(username)

    def bump_token_epoch(self, username: str) -> int:
        """Invalidate sessions. Local JWTs use a counter; Supabase tokens use iat."""
        now = datetime.utcnow().isoformat()
        from src.supabase_auth import use_supabase_auth
        with self._write_lock, self._connect() as conn:
            if use_supabase_auth():
                epoch = int(datetime.utcnow().timestamp())
                cursor = conn.execute(
                    "UPDATE users SET token_epoch = ?, updated_at = ? WHERE username = ?",
                    (epoch, now, username),
                )
                if cursor.rowcount == 0:
                    raise ValueError("user_not_found")
                return epoch
            cursor = conn.execute(
                "UPDATE users SET token_epoch = token_epoch + 1, updated_at = ? "
                "WHERE username = ?",
                (now, username),
            )
            if cursor.rowcount == 0:
                raise ValueError("user_not_found")
            row = conn.execute(
                "SELECT token_epoch FROM users WHERE username = ?",
                (username,),
            ).fetchone()
        return int(row["token_epoch"])

    def delete_user(self, username: str, *, soft: bool = True) -> bool:
        with self._write_lock, self._connect() as conn:
            if soft:
                cursor = conn.execute(
                    "UPDATE users SET is_active = 0, updated_at = ? WHERE username = ?",
                    (datetime.utcnow().isoformat(), username),
                )
            else:
                cursor = conn.execute(
                    "DELETE FROM users WHERE username = ?", (username,)
                )
            return cursor.rowcount > 0

    # ── Auth ────────────────────────────────────────────────

    def verify_password(
        self, username: str, password: str
    ) -> Optional[Dict[str, Any]]:
        row = self._lookup_user_row(username)
        if not row:
            return None
        if not self._verify(password, row["password_hash"]):
            return None
        if not row["is_active"]:
            return None
        return self._row_to_user(row)

    # ── Usage ───────────────────────────────────────────────

    def increment_usage(
        self, username: str, prompt_tokens: int, completion_tokens: int
    ) -> None:
        if prompt_tokens <= 0 and completion_tokens <= 0:
            return
        now = datetime.utcnow().isoformat()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO user_usage (username, prompt_tokens, completion_tokens, total_calls, updated_at)
                VALUES (?, ?, ?, 1, ?)
                ON CONFLICT(username) DO UPDATE SET
                    prompt_tokens     = prompt_tokens + excluded.prompt_tokens,
                    completion_tokens = completion_tokens + excluded.completion_tokens,
                    total_calls       = total_calls + 1,
                    updated_at        = excluded.updated_at
                """,
                (
                    username,
                    int(max(0, prompt_tokens)),
                    int(max(0, completion_tokens)),
                    now,
                ),
            )

    def get_usage(self, username: str) -> Dict[str, Any]:
        with self._connect() as conn:
            urow = conn.execute(
                "SELECT * FROM users WHERE username = ?", (username,)
            ).fetchone()
            if not urow:
                return {
                    "username": username,
                    "used_tokens": 0,
                    "token_limit": 0,
                    "percent_remaining": 0.0,
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_calls": 0,
                }
            row = conn.execute(
                "SELECT * FROM user_usage WHERE username = ?", (username,)
            ).fetchone()
        pt = int(row["prompt_tokens"]) if row else 0
        ct = int(row["completion_tokens"]) if row else 0
        used = pt + ct
        limit = int(urow["token_limit"])
        if limit <= 0:
            percent_remaining = 0.0
        else:
            percent_remaining = max(0.0, min(100.0, (1.0 - used / limit) * 100.0))
        return {
            "username": username,
            "used_tokens": used,
            "token_limit": limit,
            "percent_remaining": round(percent_remaining, 2),
            "prompt_tokens": pt,
            "completion_tokens": ct,
            "total_calls": int(row["total_calls"]) if row else 0,
        }

    def list_billing_summaries(self) -> Dict[str, Dict[str, Any]]:
        """Usage + billing for every account in a handful of queries."""
        with self._connect() as conn:
            users = conn.execute(
                "SELECT username, token_limit FROM users"
            ).fetchall()
            usage_rows = conn.execute("SELECT * FROM user_usage").fetchall()
        usage_by = {row["username"]: row for row in usage_rows}
        billing_by = self.billing.summaries()
        out: Dict[str, Dict[str, Any]] = {}
        for urow in users:
            username = urow["username"]
            row = usage_by.get(username)
            pt = int(row["prompt_tokens"]) if row else 0
            ct = int(row["completion_tokens"]) if row else 0
            used = pt + ct
            limit = int(urow["token_limit"])
            if limit <= 0:
                percent_remaining = 0.0
            else:
                percent_remaining = max(0.0, min(100.0, (1.0 - used / limit) * 100.0))
            out[username] = {
                "username": username,
                "used_tokens": used,
                "token_limit": limit,
                "percent_remaining": round(percent_remaining, 2),
                "prompt_tokens": pt,
                "completion_tokens": ct,
                "total_calls": int(row["total_calls"]) if row else 0,
                **billing_by.get(
                    username,
                    {
                        "plan_type": "legacy",
                        "credits_total": 0.0,
                        "credits_remaining": 0.0,
                        "credits_used": 0.0,
                        "credit_percent_remaining": 100.0,
                        "storage_used_bytes": 0,
                        "storage_limit_bytes": 0,
                        "storage_percent_used": 0.0,
                        "model_policy": "",
                        "dedicated_provider_key": False,
                    },
                ),
            }
        return out

    def get_billing_summary(self, username: str) -> Dict[str, Any]:
        """Return credit/storage state while preserving legacy token counters."""
        return {**self.get_usage(username), **self.billing.summary(username)}

    def reset_usage(self, username: str) -> Dict[str, Any]:
        now = datetime.utcnow().isoformat()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO user_usage (username, prompt_tokens, completion_tokens, total_calls, updated_at)
                VALUES (?, 0, 0, 0, ?)
                ON CONFLICT(username) DO UPDATE SET
                    prompt_tokens     = 0,
                    completion_tokens = 0,
                    total_calls       = 0,
                    updated_at        = excluded.updated_at
                """,
                (username, now),
            )
        return self.get_usage(username)

    def enforce_quota(self, username: str) -> None:
        """Raise UserQuotaExceededError if the user has consumed >= token_limit."""
        snapshot = self.get_usage(username)
        if snapshot["token_limit"] > 0 and snapshot["used_tokens"] >= snapshot["token_limit"]:
            raise UserQuotaExceededError(
                username, snapshot["used_tokens"], snapshot["token_limit"]
            )


def get_user_store() -> UserStore:
    return UserStore.instance()


__all__ = [
    "UserStore",
    "UserQuotaExceededError",
    "get_user_store",
    "DB_PATH",
]
