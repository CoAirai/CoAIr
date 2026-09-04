"""Durable per-user credit, storage and provider-cost accounting.

Money never uses binary floating point in this module. Provider cost is stored
as nano-USD and balances as micro-credits (1 credit = USD 0.01).  The ledger is
append-only; mutable account rows are only an atomic balance/cache.
"""
from __future__ import annotations

import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence

from .commerce_store import plan_org_defaults
from .config import STORAGE_DIR
from .database import DbConnection, connect, table_columns, use_postgres


DB_PATH = Path(STORAGE_DIR) / "users.db"
MICROCREDITS_PER_CREDIT = 1_000_000
NANOUSD_PER_USD = 1_000_000_000
USD_PER_CREDIT = Decimal("0.01")
DEMO_MARKUP_BPS = 3_000
DEMO_MODEL_POLICY = "demo-tiered-quality-v2"
PRICING_VERSION = "google-ai-2026-08-05"


_SCHEMA = """
CREATE TABLE IF NOT EXISTS billing_accounts (
    username                 TEXT PRIMARY KEY,
    plan_type                TEXT NOT NULL DEFAULT 'legacy',
    credits_granted_micro    INTEGER NOT NULL DEFAULT 0,
    credits_balance_micro    INTEGER NOT NULL DEFAULT 0,
    markup_bps               INTEGER NOT NULL DEFAULT 3000,
    storage_limit_bytes      INTEGER NOT NULL DEFAULT 0,
    storage_used_bytes       INTEGER NOT NULL DEFAULT 0,
    model_policy             TEXT NOT NULL DEFAULT '',
    provider_key_ref         TEXT NOT NULL DEFAULT '',
    created_at               TEXT NOT NULL,
    updated_at               TEXT NOT NULL,
    FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS billing_ledger (
    event_id                 TEXT PRIMARY KEY,
    idempotency_key          TEXT UNIQUE,
    username                 TEXT NOT NULL,
    project_id               TEXT,
    run_id                   TEXT,
    job_id                   TEXT,
    event_type               TEXT NOT NULL,
    task_type                TEXT,
    provider                 TEXT,
    model                    TEXT,
    prompt_tokens            INTEGER NOT NULL DEFAULT 0,
    completion_tokens        INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens         INTEGER NOT NULL DEFAULT 0,
    cached_tokens            INTEGER NOT NULL DEFAULT 0,
    pricing_version          TEXT,
    provider_cost_nanos      INTEGER NOT NULL DEFAULT 0,
    retail_credit_micros     INTEGER NOT NULL DEFAULT 0,
    debited_credit_micros    INTEGER NOT NULL DEFAULT 0,
    uncovered_credit_micros  INTEGER NOT NULL DEFAULT 0,
    markup_bps               INTEGER NOT NULL DEFAULT 0,
    usage_source             TEXT NOT NULL DEFAULT 'provider',
    note                     TEXT,
    created_at               TEXT NOT NULL,
    FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_user_time
    ON billing_ledger(username, created_at);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_project_time
    ON billing_ledger(project_id, created_at);
CREATE TRIGGER IF NOT EXISTS billing_ledger_no_update
BEFORE UPDATE ON billing_ledger
BEGIN
    SELECT RAISE(ABORT, 'billing ledger is append-only');
END;
CREATE TRIGGER IF NOT EXISTS billing_ledger_no_delete
BEFORE DELETE ON billing_ledger
BEGIN
    SELECT RAISE(ABORT, 'billing ledger is append-only');
END;
CREATE TABLE IF NOT EXISTS storage_objects (
    object_id       TEXT PRIMARY KEY,
    username        TEXT NOT NULL,
    project_id      TEXT NOT NULL,
    file_id         TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL,
    created_at      TEXT NOT NULL,
    deleted_at      TEXT,
    UNIQUE(project_id, file_id),
    FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_storage_objects_user
    ON storage_objects(username, deleted_at);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_microcredits(value: Decimal | int | float | str) -> int:
    return int(
        (Decimal(str(value)) * MICROCREDITS_PER_CREDIT).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


def _credits(micro: int) -> float:
    return float((Decimal(int(micro)) / MICROCREDITS_PER_CREDIT).quantize(Decimal("0.000001")))


class CreditBalanceExceededError(RuntimeError):
    def __init__(self, username: str):
        self.username = username
        super().__init__(f"Credit balance exhausted for {username}")


class StorageQuotaExceededError(RuntimeError):
    def __init__(self, username: str, used: int, limit: int, attempted: int):
        self.username = username
        self.used = used
        self.limit = limit
        self.attempted = attempted
        super().__init__(f"Storage quota exceeded for {username}: {used + attempted} / {limit}")


class BillingStore:
    _instance: Optional["BillingStore"] = None
    _instance_lock = threading.Lock()

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        if not use_postgres():
            with self._connect() as conn:
                conn.executescript(_SCHEMA)
                columns = table_columns(conn, "billing_accounts")
                if "provider_key_ref" not in columns:
                    conn.execute(
                        "ALTER TABLE billing_accounts ADD COLUMN "
                        "provider_key_ref TEXT NOT NULL DEFAULT ''"
                    )

    @classmethod
    def instance(cls) -> "BillingStore":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @contextmanager
    def _connect(self):
        with connect(self.db_path) as conn:
            yield conn

    def provision_account(
        self,
        username: str,
        *,
        plan_type: str = "legacy",
        initial_credits: Decimal | int | float | str = 0,
        markup_bps: int = DEMO_MARKUP_BPS,
        storage_limit_bytes: int = 0,
        model_policy: str = "",
        provider_key_ref: str = "",
    ) -> Dict[str, Any]:
        if plan_type not in ("legacy", "demo"):
            raise ValueError("unsupported plan_type")
        if plan_type == "demo":
            model_policy = model_policy or DEMO_MODEL_POLICY
            catalog = plan_org_defaults("demo")
            if not storage_limit_bytes:
                storage_limit_bytes = catalog["default_storage_bytes"]
            if not initial_credits:
                initial_credits = catalog["default_credits"]
        if not 0 <= int(markup_bps) <= 100_000:
            raise ValueError("markup_bps must be between 0 and 100000")
        from .provider_credentials import validate_provider_key_ref
        provider_key_ref = validate_provider_key_ref(provider_key_ref)
        grant = max(0, _to_microcredits(initial_credits))
        now = _now()
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            exists = conn.execute(
                "SELECT 1 FROM billing_accounts WHERE username=?", [username]
            ).fetchone()
            if exists:
                return self.summary(username, conn=conn)
            conn.execute(
                "INSERT INTO billing_accounts "
                "(username,plan_type,credits_granted_micro,credits_balance_micro,"
                "markup_bps,storage_limit_bytes,storage_used_bytes,model_policy,"
                "provider_key_ref,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                [username, plan_type, grant, grant, int(markup_bps),
                 max(0, int(storage_limit_bytes)), 0, model_policy,
                 provider_key_ref, now, now],
            )
            if grant:
                conn.execute(
                    "INSERT INTO billing_ledger "
                    "(event_id,idempotency_key,username,event_type,retail_credit_micros,"
                    "debited_credit_micros,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
                    [uuid.uuid4().hex, f"initial:{username}", username, "grant",
                     grant, 0, "Initial demo credit grant", now],
                )
            return self.summary(username, conn=conn)

    def get_account(self, username: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM billing_accounts WHERE username=?", [username]
            ).fetchone()
        return dict(row) if row else None

    def update_account(self, username: str, *, plan_type: str | None = None,
                       markup_percent: float | None = None,
                       storage_limit_bytes: int | None = None,
                       model_policy: str | None = None,
                       provider_key_ref: str | None = None) -> Dict[str, Any]:
        sets: List[str] = []; params: List[Any] = []
        if plan_type is not None:
            if plan_type not in ("legacy", "demo"):
                raise ValueError("unsupported plan_type")
            sets.append("plan_type=?"); params.append(plan_type)
        if markup_percent is not None:
            bps = round(float(markup_percent) * 100)
            if not 0 <= bps <= 100_000:
                raise ValueError("markup_percent must be between 0 and 1000")
            sets.append("markup_bps=?"); params.append(bps)
        if storage_limit_bytes is not None:
            if int(storage_limit_bytes) < 0:
                raise ValueError("storage_limit_bytes cannot be negative")
            sets.append("storage_limit_bytes=?"); params.append(int(storage_limit_bytes))
        if model_policy is not None:
            sets.append("model_policy=?"); params.append(str(model_policy))
        if provider_key_ref is not None:
            from .provider_credentials import validate_provider_key_ref
            sets.append("provider_key_ref=?")
            params.append(validate_provider_key_ref(provider_key_ref))
        if not sets:
            return self.summary(username)
        sets.append("updated_at=?"); params.extend([_now(), username])
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                f"UPDATE billing_accounts SET {', '.join(sets)} WHERE username=?", params
            )
            if cur.rowcount == 0:
                raise ValueError("billing account not found")
        return self.summary(username)

    def summary(self, username: str, *, conn: DbConnection | None = None) -> Dict[str, Any]:
        if conn is None:
            with self._connect() as owned:
                return self.summary(username, conn=owned)
        row = conn.execute(
            "SELECT * FROM billing_accounts WHERE username=?", [username]
        ).fetchone()
        if not row:
            return {
                "plan_type": "legacy", "credits_total": 0.0,
                "credits_remaining": 0.0, "credits_used": 0.0,
                "credit_percent_remaining": 100.0,
                "storage_used_bytes": 0, "storage_limit_bytes": 0,
                "storage_percent_used": 0.0, "model_policy": "",
                "dedicated_provider_key": False,
            }
        granted = int(row["credits_granted_micro"])
        balance = int(row["credits_balance_micro"])
        used = int(conn.execute(
            "SELECT COALESCE(SUM(debited_credit_micros),0) FROM billing_ledger "
            "WHERE username=? AND event_type='charge'", [username]
        ).fetchone()[0])
        limit = int(row["storage_limit_bytes"])
        stored = int(row["storage_used_bytes"])
        return {
            "plan_type": row["plan_type"],
            "credits_total": _credits(granted),
            "credits_remaining": _credits(balance),
            "credits_used": _credits(used),
            "credit_percent_remaining": round(
                max(0.0, min(100.0, balance * 100.0 / granted)), 2
            ) if granted > 0 else (100.0 if row["plan_type"] != "demo" else 0.0),
            "storage_used_bytes": stored,
            "storage_limit_bytes": limit,
            "storage_percent_used": round(
                max(0.0, min(100.0, stored * 100.0 / limit)), 2
            ) if limit > 0 else 0.0,
            "markup_percent": int(row["markup_bps"]) / 100.0,
            "model_policy": row["model_policy"],
            "dedicated_provider_key": bool(row["provider_key_ref"]),
        }

    def summaries(self) -> Dict[str, Dict[str, Any]]:
        """Billing snapshot for every account — two queries, not one per user."""
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM billing_accounts").fetchall()
            charge_rows = conn.execute(
                "SELECT username, COALESCE(SUM(debited_credit_micros),0) AS used "
                "FROM billing_ledger WHERE event_type='charge' GROUP BY username"
            ).fetchall()
        used_by = {row["username"]: int(row["used"]) for row in charge_rows}
        out: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            username = row["username"]
            granted = int(row["credits_granted_micro"])
            balance = int(row["credits_balance_micro"])
            used = used_by.get(username, 0)
            limit = int(row["storage_limit_bytes"])
            stored = int(row["storage_used_bytes"])
            out[username] = {
                "plan_type": row["plan_type"],
                "credits_total": _credits(granted),
                "credits_remaining": _credits(balance),
                "credits_used": _credits(used),
                "credit_percent_remaining": round(
                    max(0.0, min(100.0, balance * 100.0 / granted)), 2
                ) if granted > 0 else (100.0 if row["plan_type"] != "demo" else 0.0),
                "storage_used_bytes": stored,
                "storage_limit_bytes": limit,
                "storage_percent_used": round(
                    max(0.0, min(100.0, stored * 100.0 / limit)), 2
                ) if limit > 0 else 0.0,
                "markup_percent": int(row["markup_bps"]) / 100.0,
                "model_policy": row["model_policy"],
                "dedicated_provider_key": bool(row["provider_key_ref"]),
            }
        return out

    def enforce_credits(self, username: str) -> None:
        row = self.get_account(username)
        if row and row["plan_type"] == "demo" and int(row["credits_balance_micro"]) <= 0:
            raise CreditBalanceExceededError(username)

    def record_charge(
        self, *, username: str, project_id: str = "", run_id: str = "",
        job_id: str = "", task_type: str = "generation", provider: str,
        model: str, prompt_tokens: int, completion_tokens: int,
        reasoning_tokens: int = 0, cached_tokens: int = 0,
        provider_cost_nanos: int = 0, usage_source: str = "provider",
        pricing_version: str = PRICING_VERSION, idempotency_key: str = "",
        event_type: str = "charge", debit: bool = True,
    ) -> Dict[str, Any]:
        now = _now()
        key = idempotency_key or uuid.uuid4().hex
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            prior = conn.execute(
                "SELECT event_id FROM billing_ledger WHERE idempotency_key=?", [key]
            ).fetchone()
            if prior:
                return self.summary(username, conn=conn)
            account = conn.execute(
                "SELECT * FROM billing_accounts WHERE username=?", [username]
            ).fetchone()
            if not account:
                return self.summary(username, conn=conn)
            markup = int(account["markup_bps"])
            retail = int((
                Decimal(max(0, int(provider_cost_nanos))) / NANOUSD_PER_USD
                * (Decimal(10_000 + markup) / Decimal(10_000))
                / USD_PER_CREDIT * MICROCREDITS_PER_CREDIT
            ).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            balance = int(account["credits_balance_micro"])
            if account["plan_type"] == "demo" and debit:
                debited = min(balance, retail)
                uncovered = max(0, retail - debited)
                conn.execute(
                    "UPDATE billing_accounts SET credits_balance_micro=?,updated_at=? "
                    "WHERE username=?", [balance - debited, now, username]
                )
            else:
                debited = 0
                uncovered = 0
            conn.execute(
                "INSERT INTO billing_ledger VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [uuid.uuid4().hex, key, username, project_id or None, run_id or None,
                 job_id or None, event_type, task_type, provider, model,
                 max(0, int(prompt_tokens)), max(0, int(completion_tokens)),
                 max(0, int(reasoning_tokens)), max(0, int(cached_tokens)),
                 pricing_version, max(0, int(provider_cost_nanos)), retail, debited,
                 uncovered, markup, usage_source, None, now],
            )
            return self.summary(username, conn=conn)

    def adjust_credits(self, username: str, credits: Decimal | int | float | str,
                       note: str, *, idempotency_key: str = "") -> Dict[str, Any]:
        delta = _to_microcredits(credits)
        if delta == 0:
            raise ValueError("credit adjustment cannot be zero")
        if not (note or "").strip():
            raise ValueError("credit adjustment reason is required")
        now = _now(); key = idempotency_key or uuid.uuid4().hex
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if conn.execute("SELECT 1 FROM billing_ledger WHERE idempotency_key=?", [key]).fetchone():
                return self.summary(username, conn=conn)
            row = conn.execute(
                "SELECT * FROM billing_accounts WHERE username=?", [username]
            ).fetchone()
            if not row:
                raise ValueError("billing account not found")
            applied = delta if delta > 0 else -min(abs(delta), int(row["credits_balance_micro"]))
            granted = max(0, int(row["credits_granted_micro"]) + applied)
            balance = max(0, int(row["credits_balance_micro"]) + applied)
            conn.execute(
                "UPDATE billing_accounts SET credits_granted_micro=?,credits_balance_micro=?,"
                "updated_at=? WHERE username=?", [granted, balance, now, username]
            )
            conn.execute(
                "INSERT INTO billing_ledger "
                "(event_id,idempotency_key,username,event_type,retail_credit_micros,note,created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                [uuid.uuid4().hex, key, username, "grant" if applied > 0 else "adjustment",
                 applied, note.strip(), now],
            )
            return self.summary(username, conn=conn)

    def register_storage(self, *, username: str, project_id: str, file_id: str,
                         file_path: str, size_bytes: int) -> Dict[str, Any]:
        size = max(0, int(size_bytes)); now = _now()
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            old = conn.execute(
                "SELECT * FROM storage_objects WHERE project_id=? AND file_id=?",
                [project_id, file_id],
            ).fetchone()
            if old and old["deleted_at"] is None:
                return self.summary(username, conn=conn)
            account = conn.execute(
                "SELECT * FROM billing_accounts WHERE username=?", [username]
            ).fetchone()
            if not account:
                return self.summary(username, conn=conn)
            used = int(account["storage_used_bytes"]); limit = int(account["storage_limit_bytes"])
            from src.overage import should_block_quota

            if should_block_quota(used=used, limit=limit, attempted=size):
                raise StorageQuotaExceededError(username, used, limit, size)
            if old:
                conn.execute(
                    "UPDATE storage_objects SET username=?,file_path=?,size_bytes=?,"
                    "created_at=?,deleted_at=NULL WHERE object_id=?",
                    [username, file_path, size, now, old["object_id"]],
                )
            else:
                conn.execute(
                    "INSERT INTO storage_objects VALUES (?,?,?,?,?,?,?,NULL)",
                    [uuid.uuid4().hex, username, project_id, file_id, file_path, size, now],
                )
            conn.execute(
                "UPDATE billing_accounts SET storage_used_bytes=storage_used_bytes+?,"
                "updated_at=? WHERE username=?", [size, now, username]
            )
            return self.summary(username, conn=conn)

    def release_storage(self, *, project_id: str, file_id: str) -> None:
        now = _now()
        with self._lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT * FROM storage_objects WHERE project_id=? AND file_id=? "
                "AND deleted_at IS NULL", [project_id, file_id]
            ).fetchone()
            if not row:
                return
            conn.execute("UPDATE storage_objects SET deleted_at=? WHERE object_id=?", [now, row["object_id"]])
            conn.execute(
                "UPDATE billing_accounts SET storage_used_bytes=MAX(0,storage_used_bytes-?),"
                "updated_at=? WHERE username=?", [int(row["size_bytes"]), now, row["username"]]
            )

    def usage(self, *, username: str = "", project_id: str = "", date_from: str = "",
              date_to: str = "", usernames: Sequence[str] = (),
              project_ids: Sequence[str] = ()) -> Dict[str, Any]:
        """Grouped spend, filtered by any combination of user, project and date.

        The plural filters exist for organization rollups: a company's spend is
        the sum over its *projects*, because a project's company is fixed,
        whereas summing over its members silently rewrites history when someone
        moves between companies.
        """
        where = ["event_type IN ('charge','historical')"]; params: List[Any] = []
        for clause, value in (("username=?", username), ("project_id=?", project_id),
                              ("created_at>=?", date_from), ("created_at<=?", date_to)):
            if value:
                where.append(clause); params.append(value)
        for column, values in (("username", usernames), ("project_id", project_ids)):
            values = [v for v in values if v]
            if values:
                where.append(f"{column} IN ({','.join('?' * len(values))})")
                params.extend(values)
        sql = (
            "SELECT project_id,username,provider,model,task_type,pricing_version,"
            "usage_source,markup_bps,COUNT(*) calls,SUM(prompt_tokens) prompt_tokens,"
            "SUM(completion_tokens) completion_tokens,SUM(reasoning_tokens) reasoning_tokens,"
            "SUM(cached_tokens) cached_tokens,SUM(provider_cost_nanos) provider_cost_nanos,"
            "SUM(retail_credit_micros) retail_credit_micros,"
            "SUM(debited_credit_micros) debited_credit_micros,"
            "SUM(uncovered_credit_micros) uncovered_credit_micros,"
            "SUM(CASE WHEN retail_credit_micros>0 THEN provider_cost_nanos * "
            "(CAST(uncovered_credit_micros AS REAL)/retail_credit_micros) ELSE 0 END) "
            "uncovered_provider_cost_nanos "
            "FROM billing_ledger WHERE " + " AND ".join(where) +
            " GROUP BY project_id,username,provider,model,task_type,pricing_version,"
            "usage_source,markup_bps ORDER BY provider_cost_nanos DESC"
        )
        with self._connect() as conn:
            rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
        for row in rows:
            row["estimated_provider_cost_usd"] = round(
                int(row.pop("provider_cost_nanos") or 0) / NANOUSD_PER_USD, 9
            )
            row["uncovered_provider_cost_usd"] = round(
                float(row.pop("uncovered_provider_cost_nanos") or 0) / NANOUSD_PER_USD, 9
            )
            row["markup_percent"] = int(row.pop("markup_bps") or 0) / 100.0
            for key in ("retail_credit_micros", "debited_credit_micros", "uncovered_credit_micros"):
                row[key.removesuffix("_micros")] = _credits(int(row.pop(key) or 0))
        return {"groups": rows}

    def usage_series(self, *, weeks: int = 8) -> Dict[str, Any]:
        """Weekly provider-cost / call / token buckets for analytics charts."""
        from datetime import datetime, timedelta, timezone

        count = max(1, min(int(weeks or 8), 52))
        now = datetime.now(timezone.utc)
        end = datetime(
            now.year, now.month, now.day, 23, 59, 59, tzinfo=timezone.utc
        )
        windows = []
        for i in range(count - 1, -1, -1):
            week_end = end - timedelta(days=i * 7)
            week_start = week_end - timedelta(days=6)
            week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
            windows.append(
                {
                    "label": week_start.strftime("%b %d").lstrip()
                    .replace(" 0", " "),
                    "from": week_start.isoformat(),
                    "to": week_end.isoformat(),
                    "cost_usd": 0.0,
                    "calls": 0,
                    "tokens": 0,
                }
            )
        earliest = windows[0]["from"] if windows else ""
        sql = (
            "SELECT created_at, provider_cost_nanos, prompt_tokens, "
            "completion_tokens FROM billing_ledger "
            "WHERE event_type IN ('charge','historical') AND created_at>=?"
        )
        with self._connect() as conn:
            rows = conn.execute(sql, [earliest]).fetchall()
        for row in rows:
            created = str(row["created_at"] or "")
            for window in windows:
                if window["from"] <= created <= window["to"]:
                    window["cost_usd"] += int(row["provider_cost_nanos"] or 0) / NANOUSD_PER_USD
                    window["calls"] += 1
                    window["tokens"] += int(row["prompt_tokens"] or 0) + int(
                        row["completion_tokens"] or 0
                    )
                    break
        series = [
            {
                "label": w["label"],
                "from": w["from"],
                "to": w["to"],
                "cost_usd": round(float(w["cost_usd"]), 4),
                "calls": int(w["calls"]),
                "tokens": int(w["tokens"]),
            }
            for w in windows
        ]
        return {"weeks": count, "series": series}

    def ledger(self, username: str, *, limit: int = 100, offset: int = 0,
               event_types: Sequence[str] = ()) -> Dict[str, Any]:
        """One account's billing history, newest first.

        The rows have always been written — every charge, top-up and claw-back
        lands here and the table is append-only — but nothing could read them
        back, so a credit balance had no explanation behind it.
        """
        where = ["username=?"]; params: List[Any] = [username]
        types = [t for t in event_types if t]
        if types:
            where.append(f"event_type IN ({','.join('?' * len(types))})")
            params.extend(types)
        clause = " AND ".join(where)
        with self._connect() as conn:
            total = int(conn.execute(
                f"SELECT COUNT(*) FROM billing_ledger WHERE {clause}", params,
            ).fetchone()[0])
            rows = [dict(r) for r in conn.execute(
                "SELECT event_id,event_type,created_at,project_id,run_id,job_id,"
                "task_type,provider,model,prompt_tokens,completion_tokens,"
                "reasoning_tokens,cached_tokens,retail_credit_micros,"
                "debited_credit_micros,uncovered_credit_micros,note "
                f"FROM billing_ledger WHERE {clause} "
                "ORDER BY created_at DESC, event_id DESC LIMIT ? OFFSET ?",
                [*params, max(1, min(int(limit), 500)), max(0, int(offset))],
            ).fetchall()]
        for row in rows:
            for key in ("retail_credit_micros", "debited_credit_micros",
                        "uncovered_credit_micros"):
                row[key.removesuffix("_micros")] = _credits(int(row.pop(key) or 0))
        return {"entries": rows, "total": total}

    def job_usage(self, job_id: str) -> Dict[str, Any]:
        """Admin-safe exact token/cost totals for one background report job."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) calls,COALESCE(SUM(prompt_tokens),0) prompt_tokens,"
                "COALESCE(SUM(completion_tokens),0) completion_tokens,"
                "COALESCE(SUM(reasoning_tokens),0) reasoning_tokens,"
                "COALESCE(SUM(cached_tokens),0) cached_tokens,"
                "COALESCE(SUM(provider_cost_nanos),0) provider_cost_nanos,"
                "COALESCE(SUM(retail_credit_micros),0) retail_credit_micros,"
                "COALESCE(SUM(debited_credit_micros),0) debited_credit_micros,"
                "COALESCE(SUM(uncovered_credit_micros),0) uncovered_credit_micros "
                "FROM billing_ledger WHERE job_id=? AND event_type='charge'",
                [job_id],
            ).fetchone()
        value = dict(row)
        value["provider_cost_usd"] = round(
            int(value.pop("provider_cost_nanos") or 0) / NANOUSD_PER_USD, 9
        )
        for key in ("retail_credit_micros", "debited_credit_micros", "uncovered_credit_micros"):
            value[key.removesuffix("_micros")] = _credits(int(value.pop(key) or 0))
        return value


def get_billing_store() -> BillingStore:
    return BillingStore.instance()


__all__ = [
    "BillingStore", "CreditBalanceExceededError", "StorageQuotaExceededError",
    "DEMO_MARKUP_BPS",
    "DEMO_MODEL_POLICY", "PRICING_VERSION", "get_billing_store",
]
