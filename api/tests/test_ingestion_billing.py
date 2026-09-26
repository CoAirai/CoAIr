"""Ingest embedding charges must hit the uploader's CA meter (same as chat)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ.setdefault("JWT_SECRET", "test-secret-please-replace-in-prod")


@pytest.fixture()
def store(tmp_path, monkeypatch):
    from src import user_store as user_store_module

    instance = user_store_module.UserStore(db_path=tmp_path / "users.db")
    monkeypatch.setattr(user_store_module.UserStore, "_instance", instance)
    monkeypatch.setenv("LOCAL_EMBEDDING_USD_PER_1M_TOKENS", "0.10")
    # Reload config rate used by ingestion_billing if already imported.
    import src.config as config_mod
    monkeypatch.setattr(config_mod, "LOCAL_EMBEDDING_USD_PER_1M_TOKENS", 0.10)
    return instance


def test_estimate_and_cost_nanos():
    from src.ingestion_billing import estimate_embed_tokens, embedding_cost_nanos

    texts = ["abcd" * 250]  # 1000 chars → 250 tokens
    assert estimate_embed_tokens(texts) == 250
    nanos = embedding_cost_nanos(texts, provider="fastembed")
    # 250 / 1e6 * $0.10 = $0.000025 → 25_000 nanos
    assert nanos == 25_000


def test_charge_embedding_increments_usage_and_ledger(store, monkeypatch):
    from backend.core.security import current_user_var, UserContext
    from src.ingestion_billing import charge_embedding_texts
    import src.ingestion_billing as ib

    monkeypatch.setattr(ib, "LOCAL_EMBEDDING_USD_PER_1M_TOKENS", 0.10)

    store.create_user("uploader", "secret", token_limit=10_000_000)
    store.billing.provision_account("uploader", plan_type="legacy")
    token = current_user_var.set(
        UserContext(
            username="uploader",
            role="user",
            display_name="Up",
            features={},
            token_limit=10_000_000,
        )
    )
    try:
        texts = ["x" * 4000]  # 1000 tokens
        micros = charge_embedding_texts(
            texts,
            project_id="proj-1",
            job_id="job-abc",
            batch_index=1,
        )
        assert micros > 0
        snap = store.get_usage("uploader")
        assert snap["used_tokens"] == micros
        usage = store.billing.usage(username="uploader")["groups"]
        assert usage
        assert usage[0]["task_type"] == "ingestion_embedding"
    finally:
        current_user_var.reset(token)


def test_charge_embedding_idempotent(store, monkeypatch):
    from backend.core.security import current_user_var, UserContext
    from src.ingestion_billing import charge_embedding_texts
    import src.ingestion_billing as ib

    monkeypatch.setattr(ib, "LOCAL_EMBEDDING_USD_PER_1M_TOKENS", 0.10)
    store.create_user("idem", "secret", token_limit=10_000_000)
    store.billing.provision_account("idem", plan_type="legacy")
    token = current_user_var.set(
        UserContext(
            username="idem",
            role="user",
            display_name="Id",
            features={},
            token_limit=10_000_000,
        )
    )
    try:
        texts = ["hello world " * 100]
        charge_embedding_texts(
            texts, project_id="p", job_id="j1", batch_index=0, username="idem"
        )
        once = store.get_usage("idem")["used_tokens"]
        charge_embedding_texts(
            texts, project_id="p", job_id="j1", batch_index=0, username="idem"
        )
        assert store.get_usage("idem")["used_tokens"] == once
    finally:
        current_user_var.reset(token)


def test_charge_noop_without_user(store, monkeypatch):
    from backend.core.security import current_user_var
    from src.ingestion_billing import charge_embedding_texts
    import src.ingestion_billing as ib

    monkeypatch.setattr(ib, "LOCAL_EMBEDDING_USD_PER_1M_TOKENS", 0.10)
    store.create_user("nobody", "secret", token_limit=10_000_000)
    current_user_var.set(None)
    charged = charge_embedding_texts(
        ["plenty of text here for tokens"],
        project_id="p",
        job_id="j",
        batch_index=1,
    )
    assert charged == 0
    assert store.get_usage("nobody")["used_tokens"] == 0


def test_enforce_uploader_budget_blocks_exhausted(store):
    from src.ingestion_billing import enforce_uploader_budget
    from src.user_store import UserQuotaExceededError

    store.create_user("broke", "secret", token_limit=100)
    store.increment_usage("broke", 100, 0)
    with pytest.raises(UserQuotaExceededError):
        enforce_uploader_budget("broke")
