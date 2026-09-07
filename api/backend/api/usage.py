"""Usage / budget endpoints — exposes the global LLM cost counter."""

from fastapi import APIRouter, Query

from src.usage_tracker import get_snapshot, reset_usage
from src.billing_store import get_billing_store

router = APIRouter()


@router.get("/usage")
def read_usage() -> dict:
    """Return the application-wide usage snapshot."""
    snap = get_snapshot()
    return {
        "used_usd": snap.used_usd,
        "limit_usd": snap.limit_usd,
        "remaining_usd": snap.remaining_usd,
        "remaining_pct": snap.remaining_pct,
        "over_budget": snap.over_budget,
        "prompt_tokens": snap.prompt_tokens,
        "completion_tokens": snap.completion_tokens,
        "total_tokens": snap.total_tokens,
        "total_calls": snap.total_calls,
    }


@router.post("/usage/reset")
def reset_usage_counter() -> dict:
    """Reset the global usage counter. Admin operation."""
    snap = reset_usage()
    return {
        "used_usd": snap.used_usd,
        "limit_usd": snap.limit_usd,
        "remaining_usd": snap.remaining_usd,
        "remaining_pct": snap.remaining_pct,
        "over_budget": snap.over_budget,
        "prompt_tokens": snap.prompt_tokens,
        "completion_tokens": snap.completion_tokens,
        "total_tokens": snap.total_tokens,
        "total_calls": snap.total_calls,
    }


@router.get("/admin/usage")
def billing_usage(
    username: str = Query(""), project_id: str = Query(""),
    date_from: str = Query(""), date_to: str = Query(""),
) -> dict:
    """Admin-only project/user billing breakdown (router is admin-gated)."""
    return get_billing_store().usage(
        username=username, project_id=project_id,
        date_from=date_from, date_to=date_to,
    )


@router.get("/admin/usage/series")
def billing_usage_series(weeks: int = Query(8, ge=1, le=52)) -> dict:
    """Weekly spend / calls / tokens for Super Admin analytics."""
    return get_billing_store().usage_series(weeks=weeks)


@router.get("/admin/queries")
def billing_queries(
    username: str = Query(""),
    org_id: str = Query(""),
    date_from: str = Query(""),
    date_to: str = Query(""),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    """Per-call rows: CA tokens used + Gemini input/output for Super Admin."""
    org_usernames: list[str] = []
    if org_id.strip() and not username.strip():
        from src.org_store import get_org_store

        org_usernames = get_org_store().list_usernames(org_id.strip())
    return get_billing_store().list_queries(
        username=username.strip(),
        org_usernames=org_usernames,
        since=date_from.strip(),
        until=date_to.strip(),
        limit=limit,
        offset=offset,
    )
