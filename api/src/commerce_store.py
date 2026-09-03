"""Durable tickets, packages, sell rate, access requests, and org subscriptions."""

from __future__ import annotations

import json
import re
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from .config import STORAGE_DIR
from .database import DbRow, connect, use_postgres


DB_PATH = Path(STORAGE_DIR) / "commerce.db"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
TICKET_PRIORITIES = ("low", "medium", "high")
TICKET_STATUSES = ("open", "resolved")
PLAN_IDS = ("demo", "foundation", "pro", "enterprise", "custom")
MODULE_IDS = ("chatbot", "chronology", "forensic")
MODULE_ACCESS = ("included", "trial", "addon")

_CHATBOT = {"access": "included"}
_ADDON = {"access": "addon"}
_TRIAL = {"access": "trial", "trial_reports": 1}
_PAID = {"chatbot": dict(_CHATBOT), "chronology": dict(_ADDON), "forensic": dict(_ADDON)}

DEFAULT_PLANS: List[Dict[str, Any]] = [
    {
        "id": "demo",
        "name": "Demo",
        "price_label": "Trial",
        "users_included": 3,
        "storage_limit_gb": 20,
        "api_credits_usd": 20,
        "query_cap": 376,
        "modules": {
            "chatbot": dict(_CHATBOT),
            "chronology": dict(_TRIAL),
            "forensic": dict(_TRIAL),
        },
    },
    {
        "id": "foundation",
        "name": "Foundation",
        "price_label": "Foundation",
        "users_included": 5,
        "storage_limit_gb": 20,
        "api_credits_usd": 50,
        "query_cap": 939,
        "modules": {key: dict(value) for key, value in _PAID.items()},
    },
    {
        "id": "pro",
        "name": "Pro",
        "price_label": "Pro",
        "users_included": 10,
        "storage_limit_gb": 80,
        "api_credits_usd": 100,
        "query_cap": 1878,
        "modules": {key: dict(value) for key, value in _PAID.items()},
    },
    {
        "id": "enterprise",
        "name": "Enterprise",
        "price_label": "Enterprise",
        "users_included": 15,
        "storage_limit_gb": 150,
        "api_credits_usd": 200,
        "query_cap": 3756,
        "modules": {key: dict(value) for key, value in _PAID.items()},
    },
    {
        "id": "custom",
        "name": "Custom",
        "price_label": "Custom",
        "users_included": 25,
        "storage_limit_gb": 300,
        "api_credits_usd": 400,
        "query_cap": 7512,
        "modules": {key: dict(value) for key, value in _PAID.items()},
    },
]

DEFAULT_TOKEN_ECONOMICS = {
    "provider_tokens_per_usd": 100,
    "sell_tokens_per_usd": 80,
    "updated_by": "system",
}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tickets (
    ticket_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    assignee_id TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(org_id, created_at);

CREATE TABLE IF NOT EXISTS packages (
    plan_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS token_economics (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider_tokens_per_usd REAL NOT NULL,
    sell_tokens_per_usd REAL NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_requests (
    request_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    company_name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_plan_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests(email, status);

CREATE TABLE IF NOT EXISTS org_subscriptions (
    org_id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    needs_checkout INTEGER NOT NULL,
    sell_tokens_per_usd_override REAL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stripe_fulfillments (
    session_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def gb_to_bytes(storage_limit_gb: int) -> int:
    return int(storage_limit_gb) * 1024 * 1024 * 1024


def _plan_seed(plan_id: str) -> Dict[str, Any]:
    for item in DEFAULT_PLANS:
        if item["id"] == plan_id:
            return dict(item)
    return {}


def plan_org_defaults(plan_id: str) -> Dict[str, Any]:
    """Credits and storage from the live commerce catalog."""
    plan = get_commerce_store().get_plan(plan_id) or _plan_seed(plan_id)
    if not plan:
        return {"default_credits": 0.0, "default_storage_bytes": 0}
    storage_gb = int(plan.get("storage_limit_gb") or 0)
    return {
        "default_credits": float(plan.get("api_credits_usd") or 0),
        "default_storage_bytes": gb_to_bytes(storage_gb),
    }


def org_type_catalog_plan(org_plan_type: str) -> Optional[str]:
    if org_plan_type == "demo":
        return "demo"
    return None


def resolve_org_plan_limits(
    org_plan_type: str,
    *,
    credits: Optional[float] = None,
    storage_bytes: Optional[int] = None,
) -> Dict[str, Any]:
    catalog_id = org_type_catalog_plan(org_plan_type)
    if catalog_id:
        defaults = plan_org_defaults(catalog_id)
        return {
            "default_credits": (
                credits if credits is not None else defaults["default_credits"]
            ),
            "default_storage_bytes": (
                storage_bytes
                if storage_bytes is not None
                else defaults["default_storage_bytes"]
            ),
        }
    return {
        "default_credits": credits or 0,
        "default_storage_bytes": storage_bytes or 0,
    }


def resolve_user_provision_limits(
    plan_type: str,
    *,
    initial_credits: Optional[float] = None,
    storage_limit_bytes: Optional[int] = None,
) -> Dict[str, Any]:
    if plan_type != "demo":
        return {
            "initial_credits": initial_credits or 0,
            "storage_limit_bytes": storage_limit_bytes or 0,
        }
    defaults = plan_org_defaults("demo")
    return {
        "initial_credits": (
            initial_credits
            if initial_credits is not None
            else defaults["default_credits"]
        ),
        "storage_limit_bytes": (
            storage_limit_bytes
            if storage_limit_bytes is not None
            else defaults["default_storage_bytes"]
        ),
    }


class CommerceStore:
    _instance: Optional["CommerceStore"] = None
    _instance_lock = threading.Lock()

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._write_lock = threading.RLock()
        if not use_postgres():
            with self._connect() as conn:
                conn.executescript(_SCHEMA)
                self._seed(conn)
        else:
            with self._connect() as conn:
                conn.execute(
                    "CREATE TABLE IF NOT EXISTS stripe_fulfillments ("
                    "session_id TEXT PRIMARY KEY, org_id TEXT NOT NULL, "
                    "kind TEXT NOT NULL, payload_json TEXT NOT NULL, "
                    "created_at TEXT NOT NULL)"
                )
                self._seed(conn)

    @classmethod
    def instance(cls) -> "CommerceStore":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @contextmanager
    def _connect(self):
        with connect(self.db_path) as conn:
            yield conn

    def _seed(self, conn) -> None:
        now = _now()
        for plan in DEFAULT_PLANS:
            conn.execute(
                "INSERT OR IGNORE INTO packages (plan_id, payload_json, updated_at) "
                "VALUES (?,?,?)",
                [plan["id"], _json(plan), now],
            )
        conn.execute(
            "INSERT OR IGNORE INTO token_economics "
            "(id, provider_tokens_per_usd, sell_tokens_per_usd, updated_at, updated_by) "
            "VALUES (1,?,?,?,?)",
            [
                DEFAULT_TOKEN_ECONOMICS["provider_tokens_per_usd"],
                DEFAULT_TOKEN_ECONOMICS["sell_tokens_per_usd"],
                now,
                DEFAULT_TOKEN_ECONOMICS["updated_by"],
            ],
        )

    # ── Tickets ─────────────────────────────────────────────

    def create_ticket(
        self,
        org_id: str,
        *,
        subject: str,
        message: str,
        priority: str,
        created_by: str,
    ) -> Dict[str, Any]:
        clean_subject = (subject or "").strip()
        clean_message = (message or "").strip()
        if not clean_subject:
            raise ValueError("subject_required")
        if not clean_message:
            raise ValueError("message_required")
        if priority not in TICKET_PRIORITIES:
            raise ValueError("invalid_priority")
        now = _now()
        ticket_id = f"tkt-{uuid.uuid4().hex[:12]}"
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO tickets (ticket_id, org_id, subject, message, priority, "
                "status, assignee_id, created_by, created_at, updated_at) "
                "VALUES (?,?,?,?,?,'open',NULL,?,?,?)",
                [ticket_id, org_id, clean_subject[:200], clean_message[:8000],
                 priority, created_by, now, now],
            )
        return self.get_ticket(ticket_id) or {}

    def get_ticket(self, ticket_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM tickets WHERE ticket_id=?", [ticket_id]
            ).fetchone()
        return self._ticket_row(row) if row else None

    def list_tickets(self, org_id: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM tickets"
        params: List[Any] = []
        if org_id:
            sql += " WHERE org_id=?"
            params.append(org_id)
        sql += " ORDER BY created_at DESC"
        with self._connect() as conn:
            return [self._ticket_row(row) for row in conn.execute(sql, params)]

    def update_ticket(
        self,
        ticket_id: str,
        *,
        assignee_id: Optional[str] = None,
        status: Optional[str] = None,
        unassign: bool = False,
    ) -> Optional[Dict[str, Any]]:
        current = self.get_ticket(ticket_id)
        if not current:
            return None
        if status is not None and status not in TICKET_STATUSES:
            raise ValueError("invalid_status")
        sets = ["updated_at=?"]
        params: List[Any] = [_now()]
        if unassign:
            sets.append("assignee_id=NULL")
        elif assignee_id is not None:
            sets.append("assignee_id=?")
            params.append(assignee_id.strip() or None)
        if status is not None:
            sets.append("status=?")
            params.append(status)
        params.append(ticket_id)
        with self._write_lock, self._connect() as conn:
            conn.execute(
                f"UPDATE tickets SET {', '.join(sets)} WHERE ticket_id=?", params
            )
        return self.get_ticket(ticket_id)

    @staticmethod
    def _ticket_row(row: DbRow) -> Dict[str, Any]:
        created = row["created_at"] or ""
        return {
            "id": row["ticket_id"],
            "company_id": row["org_id"],
            "subject": row["subject"],
            "message": row["message"],
            "priority": row["priority"],
            "status": row["status"],
            "assignee_id": row["assignee_id"],
            "created_by": row["created_by"],
            "created_at": created[:10],
        }

    # ── Packages ────────────────────────────────────────────

    def list_plans(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM packages"
            ).fetchall()
        by_id = {item["id"]: item for item in (json.loads(row["payload_json"]) for row in rows)}
        return [by_id[plan_id] for plan_id in PLAN_IDS if plan_id in by_id]

    def get_plan(self, plan_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM packages WHERE plan_id=?", [plan_id]
            ).fetchone()
        return json.loads(row["payload_json"]) if row else None

    def update_plan(self, plan_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        current = self.get_plan(plan_id)
        if not current:
            raise ValueError("plan_not_found")
        next_plan = dict(current)
        for key in ("name", "price_label"):
            if key in patch and patch[key] is not None:
                next_plan[key] = str(patch[key]).strip() or current[key]
        for key in ("users_included", "storage_limit_gb", "api_credits_usd", "query_cap"):
            if key in patch and patch[key] is not None:
                value = int(patch[key])
                if value < 0:
                    raise ValueError("invalid_plan_value")
                next_plan[key] = value
        if "modules" in patch and patch["modules"] is not None:
            next_plan["modules"] = _merge_modules(current["modules"], patch["modules"])
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE packages SET payload_json=?, updated_at=? WHERE plan_id=?",
                [_json(next_plan), _now(), plan_id],
            )
        return self.get_plan(plan_id) or next_plan

    # ── Token economics ─────────────────────────────────────

    def get_token_economics(self) -> Dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM token_economics WHERE id=1").fetchone()
        return {
            "provider_tokens_per_usd": float(row["provider_tokens_per_usd"]),
            "sell_tokens_per_usd": float(row["sell_tokens_per_usd"]),
            "updated_at": row["updated_at"],
            "updated_by": row["updated_by"],
        }

    def update_token_economics(
        self,
        *,
        provider_tokens_per_usd: float,
        sell_tokens_per_usd: float,
        updated_by: str,
    ) -> Dict[str, Any]:
        if provider_tokens_per_usd <= 0 or sell_tokens_per_usd <= 0:
            raise ValueError("invalid_token_rate")
        now = _now()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE token_economics SET provider_tokens_per_usd=?, "
                "sell_tokens_per_usd=?, updated_at=?, updated_by=? WHERE id=1",
                [float(provider_tokens_per_usd), float(sell_tokens_per_usd),
                 now, updated_by],
            )
        return self.get_token_economics()

    # ── Access requests ─────────────────────────────────────

    def create_access_request(
        self, *, full_name: str, email: str, company_name: str
    ) -> Dict[str, Any]:
        name = (full_name or "").strip()
        company = (company_name or "").strip()
        address = (email or "").strip().lower()
        if not name:
            raise ValueError("full_name_required")
        if not EMAIL_RE.match(address):
            raise ValueError("invalid_email")
        if not company:
            raise ValueError("company_name_required")
        with self._write_lock, self._connect() as conn:
            existing = conn.execute(
                "SELECT 1 FROM access_requests WHERE email=? AND status='pending'",
                [address],
            ).fetchone()
            if existing:
                raise ValueError("pending_request_exists")
            request_id = f"ar-{uuid.uuid4().hex[:12]}"
            now = _now()
            conn.execute(
                "INSERT INTO access_requests (request_id, full_name, email, "
                "company_name, status, created_at) VALUES (?,?,?,?, 'pending', ?)",
                [request_id, name[:160], address[:160], company[:160], now],
            )
        return self.get_access_request(request_id) or {}

    def get_access_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM access_requests WHERE request_id=?", [request_id]
            ).fetchone()
        return self._request_row(row) if row else None

    def list_access_requests(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM access_requests ORDER BY created_at DESC"
            ).fetchall()
        return [self._request_row(row) for row in rows]

    def resolve_access_request(
        self, request_id: str, status: str, *, plan_id: Optional[str] = None
    ) -> Dict[str, Any]:
        if status not in ("approved", "denied"):
            raise ValueError("invalid_request_status")
        current = self.get_access_request(request_id)
        if not current:
            raise ValueError("request_not_found")
        if current["status"] != "pending":
            raise ValueError("request_not_pending")
        now = _now()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE access_requests SET status=?, resolved_at=?, "
                "resolved_plan_id=? WHERE request_id=?",
                [status, now, plan_id, request_id],
            )
        return self.get_access_request(request_id) or current

    @staticmethod
    def _request_row(row: DbRow) -> Dict[str, Any]:
        return {
            "id": row["request_id"],
            "full_name": row["full_name"],
            "email": row["email"],
            "company_name": row["company_name"],
            "status": row["status"],
            "created_at": row["created_at"],
            "resolved_at": row["resolved_at"],
            "resolved_plan_id": row["resolved_plan_id"],
        }

    # ── Subscriptions ───────────────────────────────────────

    def get_subscription(self, org_id: str) -> Dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM org_subscriptions WHERE org_id=?", [org_id]
            ).fetchone()
        if not row:
            return {
                "plan_id": "demo",
                "needs_checkout": False,
                "sell_tokens_per_usd_override": None,
            }
        return {
            "plan_id": row["plan_id"],
            "needs_checkout": bool(row["needs_checkout"]),
            "sell_tokens_per_usd_override": row["sell_tokens_per_usd_override"],
        }

    def set_subscription(
        self,
        org_id: str,
        *,
        plan_id: str,
        needs_checkout: bool,
        sell_tokens_per_usd_override: Optional[float] = None,
    ) -> Dict[str, Any]:
        if plan_id not in PLAN_IDS:
            raise ValueError("plan_not_found")
        now = _now()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO org_subscriptions (org_id, plan_id, needs_checkout, "
                "sell_tokens_per_usd_override, updated_at) VALUES (?,?,?,?,?) "
                "ON CONFLICT(org_id) DO UPDATE SET plan_id=excluded.plan_id, "
                "needs_checkout=excluded.needs_checkout, "
                "sell_tokens_per_usd_override=excluded.sell_tokens_per_usd_override, "
                "updated_at=excluded.updated_at",
                [org_id, plan_id, 1 if needs_checkout else 0,
                 sell_tokens_per_usd_override, now],
            )
        return self.get_subscription(org_id)


def _merge_modules(
    current: Dict[str, Any], incoming: Dict[str, Any]
) -> Dict[str, Any]:
    merged = {key: dict(value) for key, value in current.items()}
    for module_id, rule in (incoming or {}).items():
        if module_id not in MODULE_IDS:
            raise ValueError("invalid_module")
        access = (rule or {}).get("access")
        if access not in MODULE_ACCESS:
            raise ValueError("invalid_module_access")
        next_rule: Dict[str, Any] = {"access": access}
        if access == "trial":
            reports = int((rule or {}).get("trial_reports") or 1)
            next_rule["trial_reports"] = max(1, reports)
        merged[module_id] = next_rule
    return merged


def get_commerce_store() -> CommerceStore:
    return CommerceStore.instance()


__all__ = [
    "CommerceStore",
    "DEFAULT_PLANS",
    "get_commerce_store",
    "gb_to_bytes",
    "org_type_catalog_plan",
    "plan_org_defaults",
    "resolve_org_plan_limits",
    "resolve_user_provision_limits",
]
