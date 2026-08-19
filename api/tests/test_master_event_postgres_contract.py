"""Opt-in production-backend contract test.

Run only against a disposable PostgreSQL database:
EVENT_TEST_DATABASE_URL=postgresql://... pytest -q tests/test_master_event_postgres_contract.py
"""
from __future__ import annotations

import os
import uuid

import pytest

from src import canonical_artifacts
from src.master_event_store import MasterEventStore
from tests.test_event_search_architecture import _persist_event


POSTGRES_URL = os.getenv("EVENT_TEST_DATABASE_URL", "").strip()
pytestmark = pytest.mark.skipif(
    not POSTGRES_URL,
    reason="EVENT_TEST_DATABASE_URL must point to a disposable PostgreSQL database",
)


def test_postgres_migration_queue_search_tenant_filter_and_purge(tmp_path, monkeypatch):
    monkeypatch.setattr(canonical_artifacts, "CANONICAL_ROOT", tmp_path / "canonical")
    store = MasterEventStore(database_url=POSTGRES_URL)
    suffix = uuid.uuid4().hex[:12]
    project_a = f"contract-a-{suffix}"
    project_b = f"contract-b-{suffix}"
    doc_id = f"notice-{suffix}"
    try:
        artifact, observation_id = _persist_event(
            store, tmp_path, project_id=project_a, doc_id=doc_id,
        )
        _persist_event(store, tmp_path, project_id=project_b, doc_id=doc_id)

        rows = store.search_observations(
            project_id=project_a, query="critical delay", parties=["Contractor"],
            event_types=["delay"], date_from="2024-03-15", date_to="2024-03-20",
        )
        assert [row["observation_id"] for row in rows] == [observation_id]
        assert store.project_status(project_a)["complete"] is True

        uris = store.purge_document(project_a, doc_id)
        assert uris == [artifact.uri]
        assert store.search_observations(project_id=project_a, query="critical delay") == []
        assert store.search_observations(project_id=project_b, query="critical delay")
    finally:
        store.purge_document(project_a, doc_id)
        store.purge_document(project_b, doc_id)
        if store._pool is not None:
            store._pool.close()

