"""Platform overage policy evaluation for token and storage quotas.

Modes (from Super Admin → Overage):
- block: deny once usage reaches the trigger percent
- throttle: allow past the trigger, hard-deny at 100% (or trigger if >100)
- bill: never deny on quota; usage may exceed the package limit
"""
from __future__ import annotations

from typing import Any, Dict, Optional


def evaluate_quota(
    *,
    used: int,
    limit: int,
    attempted: int = 0,
    mode: str = "throttle",
    trigger_pct: float = 100.0,
) -> str:
    """Return ``allow`` or ``block`` for a projected usage amount."""
    if int(limit) <= 0:
        return "allow"
    projected = max(0, int(used)) + max(0, int(attempted))
    pct = (projected / float(limit)) * 100.0
    normalized = mode if mode in ("block", "throttle", "bill") else "throttle"
    trigger = max(0.0, float(trigger_pct))

    if normalized == "bill":
        return "allow"
    if normalized == "block":
        return "block" if pct >= trigger else "allow"
    # throttle
    hard_pct = max(100.0, trigger)
    return "block" if pct >= hard_pct else "allow"


def load_overage_policy(ops: Any = None) -> Dict[str, Any]:
    """Read live policy, falling back to throttle @ 100%."""
    try:
        if ops is None:
            from src.ops_store import get_ops_store

            ops = get_ops_store()
        policy = ops.get_overage_policy()
        return {
            "mode": str(policy.get("mode") or "throttle"),
            "trigger_pct": float(policy.get("trigger_pct") or 100),
            "notes": str(policy.get("notes") or ""),
        }
    except Exception:
        return {"mode": "throttle", "trigger_pct": 100.0, "notes": ""}


def should_block_quota(
    *,
    used: int,
    limit: int,
    attempted: int = 0,
    policy: Optional[Dict[str, Any]] = None,
) -> bool:
    policy = policy or load_overage_policy()
    return (
        evaluate_quota(
            used=used,
            limit=limit,
            attempted=attempted,
            mode=str(policy.get("mode") or "throttle"),
            trigger_pct=float(policy.get("trigger_pct") or 100),
        )
        == "block"
    )
