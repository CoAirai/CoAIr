"""Unified SQLite / PostgreSQL (Supabase) database access for core stores.

When ``DATABASE_URL`` or ``SUPABASE_DB_URL`` is set, all relational stores share
one Postgres database. Otherwise each store keeps its local SQLite file.
"""
from __future__ import annotations

import os
import re
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, List, Optional, Sequence, Tuple, Union
from urllib.parse import quote_plus, urlparse

from .logger import logger

MIGRATION_FILE = (
    Path(__file__).resolve().parents[1] / "migrations" / "supabase" / "001_core_schema.sql"
)

_pool = None
_pool_lock = threading.Lock()
_schema_applied = False
_schema_lock = threading.Lock()


class DbIntegrityError(Exception):
    """Raised on unique / foreign-key violations (SQLite or Postgres)."""


class DbRow:
    """Row object compatible with both sqlite3.Row indexing and dict-like access."""

    __slots__ = ("_columns", "_values", "_map")

    def __init__(self, columns: Sequence[str], values: Sequence[Any]):
        self._columns = list(columns)
        self._values = list(values)
        self._map = dict(zip(self._columns, self._values))

    def __getitem__(self, key: Union[int, str]) -> Any:
        if isinstance(key, int):
            return self._values[key]
        return self._map[key]

    def keys(self):
        return self._map.keys()

    def __contains__(self, key: object) -> bool:
        return key in self._map

    def __iter__(self):
        return iter(self._values)

    def __len__(self) -> int:
        return len(self._values)


class DbCursor:
    def __init__(self, cursor, backend: str, columns: Optional[List[str]] = None):
        self._cursor = cursor
        self._backend = backend
        self._columns = columns or []

    @property
    def rowcount(self) -> int:
        return int(getattr(self._cursor, "rowcount", -1))

    def _columns_from_description(self) -> List[str]:
        if not self._cursor.description:
            return []
        cols: List[str] = []
        for item in self._cursor.description:
            cols.append(item.name if hasattr(item, "name") else item[0])
        return cols

    def fetchone(self) -> Optional[DbRow]:
        row = self._cursor.fetchone()
        if row is None:
            return None
        if self._backend == "postgres":
            cols = self._columns or self._columns_from_description()
            return DbRow(cols, row)
        if isinstance(row, sqlite3.Row):
            return DbRow(list(row.keys()), tuple(row))
        return DbRow([], row if isinstance(row, (list, tuple)) else (row,))

    def fetchall(self) -> List[DbRow]:
        rows = self._cursor.fetchall()
        if not rows:
            return []
        if self._backend == "postgres":
            cols = self._columns or self._columns_from_description()
            return [DbRow(cols, row) for row in rows]
        result: List[DbRow] = []
        for row in rows:
            if isinstance(row, sqlite3.Row):
                result.append(DbRow(list(row.keys()), tuple(row)))
            else:
                result.append(DbRow([], row if isinstance(row, (list, tuple)) else (row,)))
        return result

    def __iter__(self):
        return iter(self.fetchall())


class DbConnection:
    """Thin wrapper over sqlite3 or psycopg connections with SQLite-style SQL."""

    def __init__(self, conn, backend: str):
        self._conn = conn
        self.backend = backend

    def execute(self, sql: str, params: Sequence[Any] = ()) -> DbCursor:
        sql = adapt_sql(sql)
        if self.backend == "postgres":
            cur = self._conn.cursor()
            try:
                cur.execute(sql, list(params) if params else None)
            except Exception as exc:
                _maybe_raise_integrity(exc)
                raise
            return DbCursor(cur, self.backend)
        try:
            cur = self._conn.execute(sql, params)
        except sqlite3.IntegrityError as exc:
            raise DbIntegrityError(str(exc)) from exc
        return DbCursor(cur, self.backend)

    def executescript(self, script: str) -> None:
        if self.backend == "postgres":
            for statement in _split_sql_statements(script):
                stmt = statement.strip()
                if stmt and not stmt.upper().startswith("PRAGMA"):
                    self.execute(stmt)
            return
        self._conn.executescript(script)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


def resolve_database_url() -> str:
    """Return Postgres URI from env (DATABASE_URL, SUPABASE_DB_URL, or composed)."""
    password = os.getenv("SUPABASE_DB_PASSWORD", "").strip()
    supabase_url = os.getenv("SUPABASE_URL", "").strip()

    # Composed URL URL-encodes the password (handles @, #, etc.).
    if password and supabase_url:
        ref = urlparse(supabase_url).netloc.split(".")[0] or ""
        if ref:
            host = os.getenv("SUPABASE_DB_HOST", "").strip()
            if not host:
                host = (
                    f"aws-0-{os.getenv('SUPABASE_DB_REGION', 'eu-central-1')}"
                    ".pooler.supabase.com"
                )
            pooler = "pooler" in host
            port = os.getenv("SUPABASE_DB_PORT", "6543" if pooler else "5432")
            user = os.getenv("SUPABASE_DB_USER", "").strip() or (
                f"postgres.{ref}" if pooler else "postgres"
            )
            db_name = os.getenv("SUPABASE_DB_NAME", "postgres")
            return (
                f"postgresql://{quote_plus(user)}:{quote_plus(password)}"
                f"@{host}:{port}/{db_name}"
            )

    return (
        os.getenv("DATABASE_URL", "").strip()
        or os.getenv("SUPABASE_DB_URL", "").strip()
    )


def use_postgres() -> bool:
    return bool(resolve_database_url())


def adapt_sql(sql: str) -> str:
    if not use_postgres():
        return sql
    text = sql.strip()
    upper = text.upper()
    if upper.startswith("PRAGMA"):
        return "SELECT 1"
    text = text.replace("BEGIN IMMEDIATE", "BEGIN")
    had_ignore = bool(re.search(r"\bINSERT\s+OR\s+IGNORE\s+INTO\b", sql, re.IGNORECASE))
    text = re.sub(
        r"\bINSERT\s+OR\s+IGNORE\s+INTO\b",
        "INSERT INTO",
        text,
        flags=re.IGNORECASE,
    )
    if had_ignore and "ON CONFLICT" not in text.upper():
        text = text.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    if "?" in text:
        text = text.replace("?", "%s")
    return text


def _split_sql_statements(script: str) -> List[str]:
    parts: List[str] = []
    current: List[str] = []
    in_dollar = False
    for line in script.splitlines():
        if "$$" in line:
            in_dollar = not in_dollar
        current.append(line)
        if not in_dollar and line.rstrip().endswith(";"):
            parts.append("\n".join(current))
            current = []
    if current:
        parts.append("\n".join(current))
    return parts


def _maybe_raise_integrity(exc: Exception) -> None:
    name = exc.__class__.__name__
    if name in {"UniqueViolation", "ForeignKeyViolation", "CheckViolation"}:
        raise DbIntegrityError(str(exc)) from exc
    module = getattr(exc.__class__, "__module__", "")
    if module.startswith("psycopg") and "Integrity" in name:
        raise DbIntegrityError(str(exc)) from exc


def postgres_connect_kwargs() -> dict:
    """Supabase transaction pooler (PgBouncer, port 6543) cannot reuse named
    prepared statements across backends. Disable them or inserts/lists fail with
    DuplicatePreparedStatement / InvalidSqlStatementName.
    """
    return {
        "autocommit": False,
        "prepare_threshold": None,
        "connect_timeout": 10,
    }


def _get_pool():
    global _pool
    if _pool is not None:
        return _pool
    url = resolve_database_url()
    if not url:
        raise RuntimeError("postgres_database_url_missing")
    with _pool_lock:
        if _pool is None:
            from psycopg_pool import ConnectionPool

            _pool = ConnectionPool(
                conninfo=url,
                min_size=max(0, int(os.getenv("DB_POOL_MIN", "0"))),
                max_size=max(1, int(os.getenv("DB_POOL_MAX", "20"))),
                kwargs=postgres_connect_kwargs(),
                open=True,
            )
            logger.info("postgres_pool_opened")
    return _pool


@contextmanager
def connect(db_path: Optional[Path] = None) -> Iterator[DbConnection]:
    """Open a store connection — Postgres pool when configured, else SQLite file."""
    if use_postgres():
        pool = _get_pool()
        with pool.connection() as raw:
            wrapper = DbConnection(raw, "postgres")
            try:
                yield wrapper
                raw.commit()
            except Exception:
                raw.rollback()
                raise
        return

    path = Path(db_path) if db_path else Path("storage") / "local.db"
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = sqlite3.connect(str(path), timeout=20)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA foreign_keys = ON")
    wrapper = DbConnection(raw, "sqlite")
    try:
        yield wrapper
        raw.commit()
    finally:
        raw.close()


def apply_core_schema(force: bool = False) -> None:
    """Apply Postgres DDL once at startup (idempotent)."""
    global _schema_applied
    if not use_postgres():
        return
    with _schema_lock:
        if _schema_applied and not force:
            return
        if not MIGRATION_FILE.is_file():
            raise RuntimeError(f"core_schema_migration_missing:{MIGRATION_FILE}")
        sql = MIGRATION_FILE.read_text(encoding="utf-8")
        pool = _get_pool()
        with pool.connection() as raw:
            wrapper = DbConnection(raw, "postgres")
            for statement in _split_sql_statements(sql):
                stmt = statement.strip()
                if stmt:
                    wrapper.execute(stmt)
            raw.commit()
        _schema_applied = True
        logger.info("postgres_core_schema_applied")


def table_columns(conn: DbConnection, table: str) -> set[str]:
    """Return column names for lightweight SQLite-style migrations."""
    if conn.backend == "postgres":
        cur = conn.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            """,
            [table],
        )
        return {row[0] for row in cur.fetchall()}
    cur = conn.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cur.fetchall()}


def close_pool() -> None:
    global _pool, _schema_applied
    with _pool_lock:
        if _pool is not None:
            _pool.close()
            _pool = None
        _schema_applied = False


__all__ = [
    "DbConnection",
    "DbCursor",
    "DbIntegrityError",
    "DbRow",
    "adapt_sql",
    "apply_core_schema",
    "close_pool",
    "connect",
    "postgres_connect_kwargs",
    "resolve_database_url",
    "table_columns",
    "use_postgres",
]
