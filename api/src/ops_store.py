"""Platform ops: audit, invoices, dunning, overage, security, resets, email outbox."""

from __future__ import annotations

import hashlib
import secrets
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from .config import STORAGE_DIR
from .database import DbIntegrityError, DbRow, connect, use_postgres


DB_PATH = Path(STORAGE_DIR) / "ops.db"
INVOICE_STATUSES = ("paid", "open", "past_due", "refunded")
DUNNING_STATUSES = ("grace", "retrying", "suspended")
OVERAGE_MODES = ("block", "throttle", "bill")
ANNOUNCEMENT_STATUSES = ("draft", "published", "archived")
TOPUP_STATUSES = ("pending", "approved", "denied")
RESET_TTL_MINUTES = 60
MFA_TTL_MINUTES = 10
SEED_FLAGS = (
    ("flag-001", "embed", "COAIR-Embed", 1),
    ("flag-002", "analyze", "COAIR-Analyze", 1),
    ("flag-003", "topups", "Token Top-ups", 0),
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_events (
    event_id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_label TEXT NOT NULL,
    detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events(at DESC);

CREATE TABLE IF NOT EXISTS invoices (
    invoice_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    status TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    due_at TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id, issued_at);

CREATE TABLE IF NOT EXISTS coupons (
    coupon_id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL,
    discount_value REAL NOT NULL,
    active INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    percent REAL NOT NULL,
    region_label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS overage_policy (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    mode TEXT NOT NULL,
    trigger_pct REAL NOT NULL,
    notes TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dunning_cases (
    case_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    status TEXT NOT NULL,
    failed_at TEXT NOT NULL,
    grace_ends_at TEXT NOT NULL,
    attempt_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS security_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    mfa_required INTEGER NOT NULL,
    session_timeout_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ip_allowlist (
    entry TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS api_keys (
    key_id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    prefix TEXT NOT NULL,
    last_four TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
);

CREATE TABLE IF NOT EXISTS mfa_challenges (
    challenge_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
);

CREATE TABLE IF NOT EXISTS email_outbox (
    outbox_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    secret TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_flags (
    flag_id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    enabled INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    maintenance_mode INTEGER NOT NULL,
    maintenance_message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
    announcement_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    published_at TEXT
);

CREATE TABLE IF NOT EXISTS topup_requests (
    request_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    username TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    amount_usd REAL NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_topups_status ON topup_requests(status, created_at);

CREATE TABLE IF NOT EXISTS member_token_requests (
    request_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    username TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    fulfill_mode TEXT,
    donor_username TEXT,
    purchase_session_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_member_token_requests_org
    ON member_token_requests(org_id, status, created_at);
"""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _today() -> str:
    return _now().date().isoformat()


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _add_days(date_str: str, days: int) -> str:
    year, month, day = [int(part) for part in date_str.split("-")[:3]]
    stamp = datetime(year, month, day, tzinfo=timezone.utc) + timedelta(days=days)
    return stamp.date().isoformat()


class OpsStore:
    _instance: Optional["OpsStore"] = None
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
                # Ensure tables added after initial migration exist on older DBs.
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS member_token_requests (
                        request_id TEXT PRIMARY KEY,
                        org_id TEXT NOT NULL,
                        username TEXT NOT NULL,
                        tokens INTEGER NOT NULL,
                        reason TEXT NOT NULL,
                        status TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        resolved_at TEXT,
                        resolved_by TEXT,
                        fulfill_mode TEXT,
                        donor_username TEXT,
                        purchase_session_id TEXT
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_member_token_requests_org
                        ON member_token_requests(org_id, status, created_at)
                    """
                )
                self._seed(conn)

    @classmethod
    def instance(cls) -> "OpsStore":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @contextmanager
    def _connect(self):
        with connect(self.db_path) as conn:
            yield conn

    def _seed(self, conn) -> None:
        conn.execute(
            "INSERT OR IGNORE INTO tax_settings (id, percent, region_label) VALUES (1, 5, 'Default')"
        )
        conn.execute(
            "INSERT OR IGNORE INTO overage_policy (id, mode, trigger_pct, notes) "
            "VALUES (1, 'throttle', 100, 'Default policy — throttle at 100% token usage')"
        )
        conn.execute(
            "INSERT OR IGNORE INTO security_settings "
            "(id, mfa_required, session_timeout_minutes) VALUES (1, 0, 30)"
        )
        conn.execute(
            "INSERT OR IGNORE INTO platform_settings "
            "(id, maintenance_mode, maintenance_message) VALUES (1, 0, '')"
        )
        for flag_id, key, label, enabled in SEED_FLAGS:
            conn.execute(
                "INSERT OR IGNORE INTO feature_flags (flag_id, key, label, enabled) "
                "VALUES (?,?,?,?)",
                [flag_id, key, label, enabled],
            )

    # ── Audit ───────────────────────────────────────────────

    def record_audit(
        self,
        *,
        actor: str,
        action: str,
        target_type: str,
        target_id: str,
        target_label: str,
        detail: str,
    ) -> Dict[str, Any]:
        event_id = f"aud-{uuid.uuid4().hex[:12]}"
        at = _now_iso()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO audit_events (event_id, at, actor, action, target_type, "
                "target_id, target_label, detail) VALUES (?,?,?,?,?,?,?,?)",
                [event_id, at, actor, action, target_type, target_id,
                 target_label, detail],
            )
        return {
            "id": event_id, "at": at, "actor": actor, "action": action,
            "target_type": target_type, "target_id": target_id,
            "target_label": target_label, "detail": detail,
        }

    def list_audit(self, action: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM audit_events"
        params: List[Any] = []
        if action and action != "all":
            sql += " WHERE action=?"
            params.append(action)
        sql += " ORDER BY at DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [
            {
                "id": row["event_id"],
                "at": row["at"],
                "actor": row["actor"],
                "action": row["action"],
                "target_type": row["target_type"],
                "target_id": row["target_id"],
                "target_label": row["target_label"],
                "detail": row["detail"],
            }
            for row in rows
        ]

    # ── Invoices ────────────────────────────────────────────

    def create_invoice(
        self,
        org_id: str,
        *,
        amount_usd: float,
        status: str = "paid",
        description: str = "",
        due_in_days: int = 14,
    ) -> Dict[str, Any]:
        if status not in INVOICE_STATUSES:
            raise ValueError("invalid_invoice_status")
        issued = _today()
        invoice_id = f"inv-{uuid.uuid4().hex[:10]}"
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO invoices (invoice_id, org_id, amount_usd, status, "
                "issued_at, due_at, description) VALUES (?,?,?,?,?,?,?)",
                [invoice_id, org_id, float(amount_usd), status, issued,
                 _add_days(issued, due_in_days), description[:200]],
            )
        invoice = self.get_invoice(invoice_id) or {}
        if status == "past_due":
            self.ensure_dunning(org_id)
        return invoice

    def get_invoice(self, invoice_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM invoices WHERE invoice_id=?", [invoice_id]
            ).fetchone()
        return self._invoice_row(row) if row else None

    def list_invoices(self, org_id: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM invoices"
        params: List[Any] = []
        if org_id:
            sql += " WHERE org_id=?"
            params.append(org_id)
        sql += " ORDER BY issued_at DESC"
        with self._connect() as conn:
            return [self._invoice_row(row) for row in conn.execute(sql, params).fetchall()]

    def update_invoice_status(self, invoice_id: str, status: str) -> Dict[str, Any]:
        if status not in INVOICE_STATUSES:
            raise ValueError("invalid_invoice_status")
        current = self.get_invoice(invoice_id)
        if not current:
            raise ValueError("invoice_not_found")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE invoices SET status=? WHERE invoice_id=?",
                [status, invoice_id],
            )
        if status == "past_due":
            self.ensure_dunning(current["company_id"])
        return self.get_invoice(invoice_id) or current

    @staticmethod
    def _invoice_row(row: DbRow) -> Dict[str, Any]:
        return {
            "id": row["invoice_id"],
            "company_id": row["org_id"],
            "amount_usd": float(row["amount_usd"]),
            "status": row["status"],
            "issued_at": row["issued_at"],
            "due_at": row["due_at"],
            "description": row["description"],
        }

    # ── Coupons / tax ───────────────────────────────────────

    def list_coupons(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM coupons ORDER BY created_at DESC"
            ).fetchall()
        return [self._coupon_row(row) for row in rows]

    def create_coupon(
        self, *, code: str, discount_type: str, discount_value: float
    ) -> Dict[str, Any]:
        clean = (code or "").strip().upper()
        if not clean:
            raise ValueError("coupon_code_required")
        if discount_type not in ("percent", "fixed"):
            raise ValueError("invalid_discount_type")
        if discount_value <= 0:
            raise ValueError("invalid_discount_value")
        coupon_id = f"cpn-{uuid.uuid4().hex[:10]}"
        now = _today()
        with self._write_lock, self._connect() as conn:
            try:
                conn.execute(
                    "INSERT INTO coupons (coupon_id, code, discount_type, "
                    "discount_value, active, created_at) VALUES (?,?,?,?,1,?)",
                    [coupon_id, clean, discount_type, float(discount_value), now],
                )
            except DbIntegrityError as exc:
                raise ValueError("coupon_exists") from exc
        return self._get_coupon(coupon_id) or {}

    def toggle_coupon(self, coupon_id: str) -> Dict[str, Any]:
        current = self._get_coupon(coupon_id)
        if not current:
            raise ValueError("coupon_not_found")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE coupons SET active=? WHERE coupon_id=?",
                [0 if current["active"] else 1, coupon_id],
            )
        return self._get_coupon(coupon_id) or current

    def _get_coupon(self, coupon_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM coupons WHERE coupon_id=?", [coupon_id]
            ).fetchone()
        return self._coupon_row(row) if row else None

    def get_active_coupon_by_code(self, code: str) -> Dict[str, Any]:
        clean = (code or "").strip().upper()
        if not clean:
            raise ValueError("coupon_code_required")
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM coupons WHERE code=?", [clean]
            ).fetchone()
        if not row:
            raise ValueError("coupon_not_found")
        coupon = self._coupon_row(row)
        if not coupon["active"]:
            raise ValueError("coupon_inactive")
        return coupon

    @staticmethod
    def _coupon_row(row: DbRow) -> Dict[str, Any]:
        return {
            "id": row["coupon_id"],
            "code": row["code"],
            "discount_type": row["discount_type"],
            "discount_value": float(row["discount_value"]),
            "active": bool(row["active"]),
            "created_at": row["created_at"],
        }

    def get_tax(self) -> Dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM tax_settings WHERE id=1").fetchone()
        return {"percent": float(row["percent"]), "region_label": row["region_label"]}

    def set_tax(self, *, percent: float, region_label: str) -> Dict[str, Any]:
        if percent < 0:
            raise ValueError("invalid_tax_percent")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE tax_settings SET percent=?, region_label=? WHERE id=1",
                [float(percent), (region_label or "Default").strip()[:80]],
            )
        return self.get_tax()

    # ── Overage / dunning ───────────────────────────────────

    def get_overage_policy(self) -> Dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM overage_policy WHERE id=1").fetchone()
        return {
            "mode": row["mode"],
            "trigger_pct": float(row["trigger_pct"]),
            "notes": row["notes"],
        }

    def set_overage_policy(
        self, *, mode: str, trigger_pct: float, notes: str = ""
    ) -> Dict[str, Any]:
        if mode not in OVERAGE_MODES:
            raise ValueError("invalid_overage_mode")
        if trigger_pct <= 0:
            raise ValueError("invalid_trigger_pct")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE overage_policy SET mode=?, trigger_pct=?, notes=? WHERE id=1",
                [mode, float(trigger_pct), notes[:500]],
            )
        return self.get_overage_policy()

    def list_dunning(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM dunning_cases ORDER BY failed_at DESC"
            ).fetchall()
        return [self._dunning_row(row) for row in rows]

    def ensure_dunning(self, org_id: str) -> Dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM dunning_cases WHERE org_id=? AND status != 'suspended'",
                [org_id],
            ).fetchone()
        if row:
            return self._dunning_row(row)
        case_id = f"dun-{uuid.uuid4().hex[:10]}"
        failed = _today()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO dunning_cases (case_id, org_id, status, failed_at, "
                "grace_ends_at, attempt_count) VALUES (?,?, 'grace', ?, ?, 1)",
                [case_id, org_id, failed, _add_days(failed, 7)],
            )
        return self.get_dunning(case_id) or {}

    def get_dunning(self, case_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM dunning_cases WHERE case_id=?", [case_id]
            ).fetchone()
        return self._dunning_row(row) if row else None

    def retry_dunning(self, case_id: str) -> Dict[str, Any]:
        current = self.get_dunning(case_id)
        if not current:
            raise ValueError("dunning_not_found")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE dunning_cases SET status='retrying', "
                "attempt_count=attempt_count+1 WHERE case_id=?",
                [case_id],
            )
        return self.get_dunning(case_id) or current

    def extend_dunning(self, case_id: str, days: int = 7) -> Dict[str, Any]:
        current = self.get_dunning(case_id)
        if not current:
            raise ValueError("dunning_not_found")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE dunning_cases SET grace_ends_at=? WHERE case_id=?",
                [_add_days(current["grace_ends_at"], days), case_id],
            )
        return self.get_dunning(case_id) or current

    @staticmethod
    def _dunning_row(row: DbRow) -> Dict[str, Any]:
        return {
            "id": row["case_id"],
            "company_id": row["org_id"],
            "status": row["status"],
            "failed_at": row["failed_at"],
            "grace_ends_at": row["grace_ends_at"],
            "attempt_count": int(row["attempt_count"]),
        }

    # ── Security ────────────────────────────────────────────

    def get_security(self) -> Dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM security_settings WHERE id=1"
            ).fetchone()
            ips = [item[0] for item in conn.execute(
                "SELECT entry FROM ip_allowlist ORDER BY entry"
            ).fetchall()]
        return {
            "mfa_required": bool(row["mfa_required"]),
            "session_timeout_minutes": int(row["session_timeout_minutes"]),
            "ip_allowlist": ips,
        }

    def set_security(
        self,
        *,
        mfa_required: Optional[bool] = None,
        session_timeout_minutes: Optional[int] = None,
    ) -> Dict[str, Any]:
        current = self.get_security()
        mfa = current["mfa_required"] if mfa_required is None else bool(mfa_required)
        timeout = (
            current["session_timeout_minutes"]
            if session_timeout_minutes is None
            else int(session_timeout_minutes)
        )
        if timeout not in (30, 60, 480):
            raise ValueError("invalid_session_timeout")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE security_settings SET mfa_required=?, "
                "session_timeout_minutes=? WHERE id=1",
                [1 if mfa else 0, timeout],
            )
        return self.get_security()

    def add_ip(self, entry: str) -> Dict[str, Any]:
        clean = (entry or "").strip()
        if not clean:
            raise ValueError("ip_required")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO ip_allowlist (entry) VALUES (?)", [clean]
            )
        return self.get_security()

    def remove_ip(self, entry: str) -> Dict[str, Any]:
        with self._write_lock, self._connect() as conn:
            conn.execute("DELETE FROM ip_allowlist WHERE entry=?", [entry])
        return self.get_security()

    def create_api_key(self, label: str) -> Dict[str, Any]:
        clean = (label or "").strip()
        if not clean:
            raise ValueError("api_key_label_required")
        raw = f"coair_{secrets.token_urlsafe(24)}"
        key_id = f"key-{uuid.uuid4().hex[:10]}"
        now = _today()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO api_keys (key_id, label, prefix, last_four, key_hash, "
                "created_at) VALUES (?,?,?,?,?,?)",
                [key_id, clean[:80], raw[:11], raw[-4:], _hash(raw), now],
            )
        record = self.get_api_key(key_id) or {}
        record["full_key"] = raw
        return record

    def get_api_key(self, key_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM api_keys WHERE key_id=?", [key_id]
            ).fetchone()
        return self._key_row(row) if row else None

    def list_api_keys(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM api_keys ORDER BY created_at DESC"
            ).fetchall()
        return [self._key_row(row) for row in rows]

    def revoke_api_key(self, key_id: str) -> Dict[str, Any]:
        current = self.get_api_key(key_id)
        if not current:
            raise ValueError("api_key_not_found")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE api_keys SET revoked_at=? WHERE key_id=?",
                [_today(), key_id],
            )
        return self.get_api_key(key_id) or current

    def verify_api_key(self, raw_key: str) -> Optional[Dict[str, Any]]:
        raw = (raw_key or "").strip()
        if not raw.startswith("coair_"):
            return None
        hashed = _hash(raw)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM api_keys WHERE key_hash=? AND revoked_at IS NULL",
                [hashed],
            ).fetchone()
        return self._key_row(row) if row else None

    @staticmethod
    def _key_row(row: DbRow) -> Dict[str, Any]:
        return {
            "id": row["key_id"],
            "label": row["label"],
            "prefix": row["prefix"],
            "last_four": row["last_four"],
            "created_at": row["created_at"],
            "revoked_at": row["revoked_at"],
        }

    # ── Password reset / MFA / outbox ───────────────────────

    def queue_email(
        self, *, kind: str, recipient: str, subject: str, body: str, secret: str = ""
    ) -> Dict[str, Any]:
        outbox_id = f"eml-{uuid.uuid4().hex[:10]}"
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO email_outbox (outbox_id, kind, recipient, subject, "
                "body, secret, created_at) VALUES (?,?,?,?,?,?,?)",
                [outbox_id, kind, recipient, subject, body, secret or None, _now_iso()],
            )
        return {"id": outbox_id, "kind": kind, "to": recipient}

    def latest_secret(self, kind: str, recipient: str) -> Optional[str]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT secret FROM email_outbox WHERE kind=? AND recipient=? "
                "AND secret IS NOT NULL ORDER BY created_at DESC LIMIT 1",
                [kind, recipient],
            ).fetchone()
        return row["secret"] if row else None

    def create_password_reset(self, username: str) -> str:
        token = secrets.token_urlsafe(24)
        expires = (_now() + timedelta(minutes=RESET_TTL_MINUTES)).isoformat()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO password_resets (token_hash, username, expires_at) "
                "VALUES (?,?,?)",
                [_hash(token), username, expires],
            )
        from .email_delivery import recipient_address, send_coair_email

        recipient = recipient_address(username)
        result = send_coair_email(
            "password_reset",
            recipient,
            name=username.split("@")[0],
            reset_token=token,
        )
        self.queue_email(
            kind="password_reset",
            recipient=recipient,
            subject="Reset your COAir password",
            body=f"Reset link queued ({result.get('mode', 'unknown')})",
            secret=token,
        )
        try:
            from .auth_notify import notify_password_reset

            notify_password_reset(username)
        except Exception:
            pass
        return token

    def consume_password_reset(self, token: str) -> str:
        hashed = _hash(token)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM password_resets WHERE token_hash=?", [hashed]
            ).fetchone()
        if not row or row["used_at"]:
            raise ValueError("invalid_reset_token")
        if row["expires_at"] < _now_iso():
            raise ValueError("reset_token_expired")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE password_resets SET used_at=? WHERE token_hash=?",
                [_now_iso(), hashed],
            )
        return str(row["username"])

    def create_mfa_challenge(self, username: str) -> Dict[str, str]:
        challenge_id = secrets.token_urlsafe(18)
        code = f"{secrets.randbelow(1000000):06d}"
        expires = (_now() + timedelta(minutes=MFA_TTL_MINUTES)).isoformat()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO mfa_challenges (challenge_id, username, code_hash, "
                "expires_at) VALUES (?,?,?,?)",
                [challenge_id, username, _hash(code), expires],
            )
        from .email_delivery import recipient_address, send_coair_email
        from backend.core.platform_guard import expose_security_debug

        recipient = recipient_address(username)
        result = send_coair_email(
            "mfa_code",
            recipient,
            name=username.split("@")[0],
            mfa_code=code,
        )
        self.queue_email(
            kind="mfa_code",
            recipient=recipient,
            subject="Your COAir sign-in code",
            body=f"MFA code queued ({result.get('mode', 'unknown')})",
            secret=code,
        )
        payload = {"mfa_token": challenge_id}
        if expose_security_debug():
            payload["debug_code"] = code
        return payload

    def consume_mfa_challenge(self, challenge_id: str, code: str) -> str:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM mfa_challenges WHERE challenge_id=?",
                [challenge_id],
            ).fetchone()
        if not row or row["used_at"]:
            raise ValueError("invalid_mfa_token")
        if row["expires_at"] < _now_iso():
            raise ValueError("mfa_token_expired")
        if row["code_hash"] != _hash((code or "").strip()):
            raise ValueError("invalid_mfa_code")
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE mfa_challenges SET used_at=? WHERE challenge_id=?",
                [_now_iso(), challenge_id],
            )
        return str(row["username"])

    # ── Feature flags / maintenance / announcements ─────────

    @staticmethod
    def _flag_row(row: DbRow) -> Dict[str, Any]:
        return {
            "id": row["flag_id"],
            "key": row["key"],
            "label": row["label"],
            "enabled": bool(row["enabled"]),
        }

    def list_flags(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM feature_flags ORDER BY key"
            ).fetchall()
        return [self._flag_row(row) for row in rows]

    def flag_map(self) -> Dict[str, bool]:
        return {flag["key"]: flag["enabled"] for flag in self.list_flags()}

    def set_flag_enabled(self, flag_id: str, enabled: bool) -> Dict[str, Any]:
        with self._write_lock, self._connect() as conn:
            cursor = conn.execute(
                "UPDATE feature_flags SET enabled=? WHERE flag_id=?",
                [1 if enabled else 0, flag_id],
            )
            if cursor.rowcount == 0:
                raise ValueError("flag_not_found")
        flags = {flag["id"]: flag for flag in self.list_flags()}
        return flags[flag_id]

    def get_maintenance(self) -> Dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM platform_settings WHERE id=1"
            ).fetchone()
        if not row:
            return {"mode": False, "message": ""}
        return {
            "mode": bool(row["maintenance_mode"]),
            "message": row["maintenance_message"] or "",
        }

    def set_maintenance(self, *, mode: bool, message: str) -> Dict[str, Any]:
        text = (message or "").strip()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO platform_settings (id, maintenance_mode, maintenance_message) "
                "VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET "
                "maintenance_mode=excluded.maintenance_mode, "
                "maintenance_message=excluded.maintenance_message",
                [1 if mode else 0, text],
            )
        return self.get_maintenance()

    @staticmethod
    def _announcement_row(row: DbRow) -> Dict[str, Any]:
        return {
            "id": row["announcement_id"],
            "title": row["title"],
            "body": row["body"],
            "status": row["status"],
            "created_at": row["created_at"],
            "published_at": row["published_at"],
        }

    def list_announcements(
        self, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM announcements"
        params: List[Any] = []
        if status:
            sql += " WHERE status=?"
            params.append(status)
        sql += " ORDER BY created_at DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._announcement_row(row) for row in rows]

    def create_announcement(self, *, title: str, body: str) -> Dict[str, Any]:
        clean_title = (title or "").strip()
        clean_body = (body or "").strip()
        if not clean_title or not clean_body:
            raise ValueError("announcement_required")
        announcement_id = f"ann-{uuid.uuid4().hex[:12]}"
        created = _now_iso()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO announcements (announcement_id, title, body, status, "
                "created_at, published_at) VALUES (?,?,?,?,?,NULL)",
                [announcement_id, clean_title, clean_body, "draft", created],
            )
        return {
            "id": announcement_id,
            "title": clean_title,
            "body": clean_body,
            "status": "draft",
            "created_at": created,
            "published_at": None,
        }

    def set_announcement_status(
        self, announcement_id: str, status: str
    ) -> Dict[str, Any]:
        if status not in ANNOUNCEMENT_STATUSES:
            raise ValueError("invalid_announcement_status")
        published_at = _now_iso() if status == "published" else None
        with self._write_lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM announcements WHERE announcement_id=?",
                [announcement_id],
            ).fetchone()
            if not row:
                raise ValueError("announcement_not_found")
            if status == "published" and row["published_at"]:
                published_at = row["published_at"]
            conn.execute(
                "UPDATE announcements SET status=?, published_at=? "
                "WHERE announcement_id=?",
                [
                    status,
                    published_at if status == "published" else row["published_at"],
                    announcement_id,
                ],
            )
        updated = [
            item for item in self.list_announcements() if item["id"] == announcement_id
        ]
        if not updated:
            raise ValueError("announcement_not_found")
        return updated[0]

    # ── Top-up requests ─────────────────────────────────────

    @staticmethod
    def _topup_row(row: DbRow) -> Dict[str, Any]:
        return {
            "id": row["request_id"],
            "company_id": row["org_id"],
            "username": row["username"],
            "tokens_requested": int(row["tokens"]),
            "amount_usd": float(row["amount_usd"]),
            "reason": row["reason"],
            "status": row["status"],
            "created_at": row["created_at"],
            "resolved_at": row["resolved_at"],
            "resolved_by": row["resolved_by"],
        }

    def list_topups(
        self, *, status: Optional[str] = None, org_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM topup_requests"
        clauses: List[str] = []
        params: List[Any] = []
        if status:
            clauses.append("status=?")
            params.append(status)
        if org_id:
            clauses.append("org_id=?")
            params.append(org_id)
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._topup_row(row) for row in rows]

    def get_topup(self, request_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM topup_requests WHERE request_id=?",
                [request_id],
            ).fetchone()
        return self._topup_row(row) if row else None

    def create_topup(
        self,
        *,
        org_id: str,
        username: str,
        tokens: int,
        amount_usd: float,
        reason: str,
    ) -> Dict[str, Any]:
        if tokens < 1:
            raise ValueError("tokens_required")
        request_id = f"top-{uuid.uuid4().hex[:12]}"
        created = _now_iso()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO topup_requests (request_id, org_id, username, tokens, "
                "amount_usd, reason, status, created_at, resolved_at, resolved_by) "
                "VALUES (?,?,?,?,?,?,?,?,NULL,NULL)",
                [
                    request_id,
                    org_id,
                    username,
                    int(tokens),
                    float(amount_usd),
                    (reason or "").strip(),
                    "pending",
                    created,
                ],
            )
        return self.get_topup(request_id) or {
            "id": request_id,
            "company_id": org_id,
            "username": username,
            "tokens_requested": int(tokens),
            "amount_usd": float(amount_usd),
            "reason": (reason or "").strip(),
            "status": "pending",
            "created_at": created,
            "resolved_at": None,
            "resolved_by": None,
        }

    def resolve_topup(
        self, request_id: str, status: str, resolved_by: str
    ) -> Dict[str, Any]:
        if status not in ("approved", "denied"):
            raise ValueError("invalid_topup_status")
        current = self.get_topup(request_id)
        if not current:
            raise ValueError("topup_not_found")
        if current["status"] != "pending":
            raise ValueError("topup_already_resolved")
        resolved_at = _now_iso()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE topup_requests SET status=?, resolved_at=?, resolved_by=? "
                "WHERE request_id=?",
                [status, resolved_at, resolved_by, request_id],
            )
        return self.get_topup(request_id) or current

    # ── Member token requests (company pool) ────────────────

    @staticmethod
    def _member_token_request_row(row: DbRow) -> Dict[str, Any]:
        return {
            "id": row["request_id"],
            "org_id": row["org_id"],
            "username": row["username"],
            "tokens": int(row["tokens"]),
            "reason": row["reason"] or "",
            "status": row["status"],
            "created_at": row["created_at"],
            "resolved_at": row["resolved_at"],
            "resolved_by": row["resolved_by"],
            "fulfill_mode": row["fulfill_mode"],
            "donor_username": row["donor_username"],
            "purchase_session_id": row["purchase_session_id"],
        }

    def list_member_token_requests(
        self,
        *,
        org_id: str,
        username: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM member_token_requests WHERE org_id=?"
        params: List[Any] = [org_id]
        if username:
            sql += " AND username=?"
            params.append(username)
        if status:
            sql += " AND status=?"
            params.append(status)
        sql += " ORDER BY created_at DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._member_token_request_row(row) for row in rows]

    def list_all_member_token_requests(
        self,
        *,
        status: Optional[str] = None,
        limit: int = 500,
    ) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM member_token_requests"
        params: List[Any] = []
        if status:
            sql += " WHERE status=?"
            params.append(status)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(max(1, min(int(limit), 2000)))
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._member_token_request_row(row) for row in rows]

    def get_member_token_request(
        self, request_id: str
    ) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM member_token_requests WHERE request_id=?",
                [request_id],
            ).fetchone()
        return self._member_token_request_row(row) if row else None

    def create_member_token_request(
        self,
        *,
        org_id: str,
        username: str,
        tokens: int,
        reason: str,
    ) -> Dict[str, Any]:
        if tokens < 1:
            raise ValueError("tokens_required")
        request_id = f"mtr-{uuid.uuid4().hex[:12]}"
        created = _now_iso()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO member_token_requests "
                "(request_id, org_id, username, tokens, reason, status, "
                "created_at, resolved_at, resolved_by, fulfill_mode, "
                "donor_username, purchase_session_id) "
                "VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,NULL)",
                [
                    request_id,
                    org_id,
                    username,
                    int(tokens),
                    (reason or "").strip(),
                    "pending",
                    created,
                ],
            )
        return self.get_member_token_request(request_id) or {
            "id": request_id,
            "org_id": org_id,
            "username": username,
            "tokens": int(tokens),
            "reason": (reason or "").strip(),
            "status": "pending",
            "created_at": created,
            "resolved_at": None,
            "resolved_by": None,
            "fulfill_mode": None,
            "donor_username": None,
            "purchase_session_id": None,
        }

    def resolve_member_token_request(
        self,
        request_id: str,
        status: str,
        resolved_by: str,
        *,
        fulfill_mode: Optional[str] = None,
        donor_username: Optional[str] = None,
        purchase_session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if status not in ("approved", "denied"):
            raise ValueError("invalid_token_request_status")
        current = self.get_member_token_request(request_id)
        if not current:
            raise ValueError("token_request_not_found")
        if current["status"] != "pending":
            raise ValueError("token_request_already_resolved")
        resolved_at = _now_iso()
        with self._write_lock, self._connect() as conn:
            conn.execute(
                "UPDATE member_token_requests SET status=?, resolved_at=?, "
                "resolved_by=?, fulfill_mode=?, donor_username=?, "
                "purchase_session_id=? WHERE request_id=?",
                [
                    status,
                    resolved_at,
                    resolved_by,
                    fulfill_mode,
                    donor_username,
                    purchase_session_id,
                    request_id,
                ],
            )
        return self.get_member_token_request(request_id) or current


def get_ops_store() -> OpsStore:
    return OpsStore.instance()


__all__ = ["OpsStore", "get_ops_store"]
