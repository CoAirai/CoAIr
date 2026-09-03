#!/usr/bin/env python3
"""One-time mid-cycle equal rebalance of remaining company tokens.

Use after deploying shared pool so existing members stop holding full-package caps.

    python scripts/rebalance_org_token_pools.py
    python scripts/rebalance_org_token_pools.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--org", default="")
    args = parser.parse_args()

    from src.org_store import get_org_store
    from src.org_token_pool import pool_snapshot, rebalance_equal_remaining
    from src.user_store import get_user_store

    orgs = get_org_store()
    users = get_user_store()
    targets = orgs.list_orgs(include_archived=False)
    if args.org.strip():
        targets = [o for o in targets if o.get("org_id") == args.org.strip()]

    print(f"orgs={len(targets)} dry_run={args.dry_run}")
    for org in targets:
        org_id = str(org.get("org_id") or "")
        name = org.get("name") or org_id
        if not org_id:
            continue
        snap = pool_snapshot(org_id, orgs=orgs, users=users)
        if args.dry_run:
            print(
                f"would_rebalance org={org_id} name={name} pool={snap['pool']} "
                f"used={snap['total_used']} remaining={snap['remaining']} "
                f"members={snap['member_count']}"
            )
            continue
        result = rebalance_equal_remaining(
            org_id, orgs=orgs, users=users
        )
        print(
            f"rebalanced org={org_id} name={name} pool={result.get('pool')} "
            f"remaining={result.get('remaining')} members={result.get('members')}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
