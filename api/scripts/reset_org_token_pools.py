#!/usr/bin/env python3
"""Manual / ops helper: equal-split company token pools.

Preferred product path is package renewal (`renew_org_subscriptions.py` or
Stripe `invoice.paid` webhook), which resets usage and re-splits the pool.

This script remains for one-off ops. Do not schedule it on a calendar month
for product renewals.

    python scripts/reset_org_token_pools.py
    python scripts/reset_org_token_pools.py --dry-run
    python scripts/reset_org_token_pools.py --org ORG_ID
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
    parser.add_argument("--org", default="", help="Limit to one org_id")
    parser.add_argument(
        "--no-reset-usage",
        action="store_true",
        help="Equal-split pool without clearing used_tokens",
    )
    args = parser.parse_args()

    from src.org_store import get_org_store
    from src.org_token_pool import rebalance_equal_full_pool
    from src.user_store import get_user_store

    orgs = get_org_store()
    users = get_user_store()
    targets = orgs.list_orgs(include_archived=False)
    if args.org.strip():
        targets = [o for o in targets if o.get("org_id") == args.org.strip()]

    reset_usage = not args.no_reset_usage
    print(
        f"orgs={len(targets)} dry_run={args.dry_run} reset_usage={reset_usage}"
    )
    for org in targets:
        org_id = str(org.get("org_id") or "")
        name = org.get("name") or org_id
        if not org_id:
            continue
        if args.dry_run:
            members = orgs.list_members(org_id)
            print(f"would_reset org={org_id} name={name} members={len(members)}")
            continue
        result = rebalance_equal_full_pool(
            org_id,
            reset_usage=reset_usage,
            orgs=orgs,
            users=users,
        )
        print(
            f"reset org={org_id} name={name} pool={result.get('pool')} "
            f"members={result.get('members')}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
