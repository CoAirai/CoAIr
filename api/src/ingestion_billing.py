"""Bill uploaders for document injection (embeddings + quota gates).

Chat already attributes Gemini cost to the active user via ``llm_client``.
Ingest embeddings (local fastembed / API / Gemini) previously ran free on the
platform. This module maps embed batches to CA micros on the uploading user
so Knowledge Base injection uses the same meter as chat.
"""
from __future__ import annotations

import hashlib
from typing import Iterable, List, Optional, Sequence

from .ca_tokens import nanos_to_ca_micros
from .config import (
    EMBEDDING_PROVIDER,
    EMBEDDING_MODEL,
    LOCAL_EMBEDDING_MODEL,
    LOCAL_EMBEDDING_USD_PER_1M_TOKENS,
    EMBEDDING_PRICING,
)
from .logger import logger

NANOUSD_PER_USD = 1_000_000_000


def estimate_embed_tokens(texts: Sequence[str]) -> int:
    """Rough token estimate: ~4 chars per token, min 1 per non-empty string."""
    total = 0
    for text in texts:
        raw = text or ""
        if not raw:
            continue
        total += max(1, len(raw) // 4)
    return total


def embedding_cost_nanos(texts: Sequence[str], *, provider: str = "", model: str = "") -> int:
    """USD nanos for embedding ``texts`` under the active (or given) provider."""
    provider = (provider or EMBEDDING_PROVIDER or "fastembed").lower()
    model = model or (
        EMBEDDING_MODEL if provider == "gemini" else LOCAL_EMBEDDING_MODEL
    )
    tokens = estimate_embed_tokens(texts)
    if tokens <= 0:
        return 0

    if provider == "gemini":
        # Legacy table is USD per embedding call; prefer token rate when unknown.
        per_call = EMBEDDING_PRICING.get(model) or EMBEDDING_PRICING.get(
            "gemini-embedding-001"
        )
        if per_call is not None:
            # Approximate: one "call" per text in the batch.
            usd = float(per_call) * len([t for t in texts if t])
            return int(round(usd * NANOUSD_PER_USD))

    # local / fastembed / api: bill platform compute (or hosted API) at $/1M tokens.
    usd_per_m = float(LOCAL_EMBEDDING_USD_PER_1M_TOKENS or 0.0)
    if usd_per_m <= 0:
        return 0
    usd = (tokens / 1_000_000.0) * usd_per_m
    return int(round(usd * NANOUSD_PER_USD))


def _embedding_model_label() -> str:
    if EMBEDDING_PROVIDER == "gemini":
        return EMBEDDING_MODEL
    return LOCAL_EMBEDDING_MODEL


def enforce_uploader_budget(username: str) -> None:
    """Block upload/indexing when the uploader has no remaining CA.

    Demo and paid packages both gate on the CA token pool (``token_limit``),
    matching the sidebar meter. The legacy demo credit wallet is not used as a
    hard stop — that caused "credits exhausted" while CA still remained.
    """
    if not username:
        return
    from .user_store import get_user_store

    get_user_store().enforce_quota(username)


def charge_embedding_texts(
    texts: Sequence[str],
    *,
    username: str = "",
    project_id: str = "",
    job_id: str = "",
    batch_index: int = 0,
    provider: str = "",
    model: str = "",
) -> int:
    """Charge the uploader for one ingest embed batch. Returns CA micros charged.

    Idempotent per ``job_id`` + ``batch_index`` (+ content hash). Skips when no
    username is set (CLI / platform ops). Enforces quota before writing usage.
    """
    if not texts:
        return 0

    if not username:
        try:
            from backend.core.security import get_current_username

            username = get_current_username() or ""
        except Exception:
            username = ""
    if not username:
        return 0

    enforce_uploader_budget(username)

    provider = (provider or EMBEDDING_PROVIDER or "fastembed").lower()
    model = model or _embedding_model_label()
    prompt_tokens = estimate_embed_tokens(texts)
    cost_nanos = embedding_cost_nanos(texts, provider=provider, model=model)
    if prompt_tokens <= 0 or cost_nanos <= 0:
        return 0

    digest = hashlib.sha256(
        "\n".join(texts).encode("utf-8", errors="replace")
    ).hexdigest()[:16]
    idem = (
        f"ingest-embed:{job_id or 'noj'}:{batch_index}:{digest}"
        if job_id
        else f"ingest-embed:{username}:{project_id}:{batch_index}:{digest}"
    )

    from .user_store import get_user_store
    from .run_store import current_run_id_var

    store = get_user_store()
    with store.billing._connect() as conn:
        prior = conn.execute(
            "SELECT 1 FROM billing_ledger WHERE idempotency_key=?", [idem]
        ).fetchone()
    if prior:
        return 0

    ca_micros = nanos_to_ca_micros(cost_nanos)
    if ca_micros > 0:
        store.increment_usage(username, ca_micros, 0)

    run_id = ""
    try:
        run_id = current_run_id_var.get() or ""
    except Exception:
        run_id = ""

    store.billing.record_charge(
        username=username,
        project_id=project_id or "",
        run_id=run_id or job_id,
        job_id=job_id or run_id,
        task_type="ingestion_embedding",
        provider=provider if provider != "fastembed" else "local",
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=0,
        provider_cost_nanos=cost_nanos,
        usage_source="estimated",
        idempotency_key=idem,
    )
    logger.info(
        "[IngestBilling] embed charge user=%s tokens=%s ca_micros=%s batch=%s",
        username,
        prompt_tokens,
        ca_micros,
        batch_index,
    )
    return ca_micros


__all__ = [
    "estimate_embed_tokens",
    "embedding_cost_nanos",
    "enforce_uploader_budget",
    "charge_embedding_texts",
]
