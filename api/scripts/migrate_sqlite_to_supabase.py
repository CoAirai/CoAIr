#!/usr/bin/env python3
"""One-time copy of local SQLite stores into Supabase Postgres.

Usage (from repo root, with DATABASE_URL or SUPABASE_DB_URL set):

    python scripts/migrate_sqlite_to_supabase.py

Optional flags:
    --dry-run   Print row counts only, do not write.
    --force     Truncate target tables before import (destructive).
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from src.config import STORAGE_DIR
from src.database import apply_core_schema, connect, resolve_database_url, use_postgres

# Import order respects foreign keys.
TABLES_BY_SQLITE = {
    "users.db": [
        "users",
        "user_usage",
        "billing_accounts",
        "billing_ledger",
        "storage_objects",
    ],
    "projects.db": [
        "organizations",
        "org_members",
        "projects",
        "project_members",
        "project_vector_state",
    ],
    "ops.db": [
        "audit_events",
        "invoices",
        "coupons",
        "tax_settings",
        "overage_policy",
        "dunning_cases",
        "security_settings",
        "ip_allowlist",
        "api_keys",
        "password_resets",
        "mfa_challenges",
        "email_outbox",
        "feature_flags",
        "platform_settings",
        "announcements",
        "topup_requests",
    ],
    "commerce.db": [
        "packages",
        "token_economics",
        "tickets",
        "access_requests",
        "org_subscriptions",
    ],
}


def _sqlite_rows(db_path: Path, table: str) -> tuple[list[str], list[tuple]]:
    if not db_path.is_file():
        return [], []
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        cols = [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if not cols:
            return [], []
        rows = [tuple(r[c] for c in cols) for r in conn.execute(f"SELECT * FROM {table}")]
        return cols, rows
    finally:
        conn.close()


def _truncate_all(force: bool) -> None:
    if not force:
        return
    tables = []
    for names in TABLES_BY_SQLITE.values():
        tables.extend(names)
    with connect() as conn:
        for table in reversed(tables):
            conn.execute(f"DELETE FROM {table}")


def migrate(*, dry_run: bool = False, force: bool = False) -> None:
    if not use_postgres():
        url = resolve_database_url()
        raise SystemExit(
            "Set DATABASE_URL or SUPABASE_DB_URL (or SUPABASE_URL + SUPABASE_DB_PASSWORD) "
            f"before running migration. Current URL empty."
        )

    apply_core_schema(force=True)
    if force and not dry_run:
        _truncate_all(force=True)

    total = 0
    for db_name, tables in TABLES_BY_SQLITE.items():
        db_path = Path(STORAGE_DIR) / db_name
        for table in tables:
            cols, rows = _sqlite_rows(db_path, table)
            print(f"{db_name}:{table} -> {len(rows)} row(s)")
            if dry_run or not rows:
                continue
            placeholders = ", ".join(["%s"] * len(cols))
            col_list = ", ".join(cols)
            sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
            with connect() as conn:
                for row in rows:
                    conn.execute(sql, row)
            total += len(rows)

    print(f"Migration complete — attempted {total} row insert(s).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Copy SQLite core stores to Supabase Postgres")
    parser.add_argument("--dry-run", action="store_true", help="Count rows only")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing Postgres rows before import (destructive)",
    )
    args = parser.parse_args()
    migrate(dry_run=args.dry_run, force=args.force)


if __name__ == "__main__":
    main()
