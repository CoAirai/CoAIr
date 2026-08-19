"""Tests for SQLite/Postgres database adapter."""
from __future__ import annotations

from src.database import DbRow, adapt_sql, use_postgres


def test_adapt_sql_sqlite_unchanged():
    sql = "SELECT * FROM users WHERE username=?"
    assert adapt_sql(sql) == sql or use_postgres()


def test_adapt_sql_insert_or_ignore_only_when_postgres():
    sql = "INSERT OR IGNORE INTO tax_settings (id) VALUES (1)"
    adapted = adapt_sql(sql)
    if use_postgres():
        assert "ON CONFLICT DO NOTHING" in adapted
        assert "INSERT OR IGNORE" not in adapted.upper()
    else:
        assert adapted == sql


def test_db_row_index_and_key():
    row = DbRow(["a", "b"], [1, 2])
    assert row["a"] == 1
    assert row[1] == 2
    assert list(row.keys()) == ["a", "b"]
