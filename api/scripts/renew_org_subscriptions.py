#!/usr/bin/env python3
"""Renew local (non-Stripe) packages whose period has ended and auto_renew is on.

Stripe-billed packages renew via webhook (invoice.paid → renew_package_period).
This job covers dummy/dev orgs without a stripe_subscription_id.

Token pool reset happens on renewal (not on calendar month).

    python scripts/renew_org_subscriptions.py
    python scripts/renew_org_subscriptions.py --dry-run

VPS cron (daily 00:10 UTC):

    10 0 * * * root cd /opt/coair-api && docker compose -f docker-compose.vps.yml \\
      exec -T api python scripts/renew_org_subscriptions.py >> /var/log/coair-subscription-renew.log 2>&1
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        return stamp
    except Exception:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    from src.commerce_store import get_commerce_store
    from src.stripe_billing import cancel_package_subscription, renew_package_period
    from src.org_store import get_org_store
    from src.ops_store import get_ops_store

    commerce = get_commerce_store()
    orgs = get_org_store()
    ops = get_ops_store()
    now = datetime.now(timezone.utc)
    rows = commerce.list_subscriptions()
    print(f"subscriptions={len(rows)} dry_run={args.dry_run}")

    for row in rows:
        org_id = str(row.get("org_id") or "")
        if not org_id:
            continue
        if (row.get("stripe_subscription_id") or "").strip():
            # Stripe renewals are handled by webhooks.
            continue
        plan_id = str(row.get("plan_id") or "demo")
        if plan_id == "demo":
            continue
        period_end = _parse_iso(row.get("current_period_end"))
        if period_end is None or period_end > now:
            continue
        if row.get("auto_renew") and not row.get("cancel_at_period_end"):
            if args.dry_run:
                print(f"would_renew org={org_id} plan={plan_id}")
                continue
            result = renew_package_period(org_id, actor="system:local-renew")
            print(
                f"renewed org={org_id} plan={plan_id} "
                f"period_end={result['subscription'].get('current_period_end')}"
            )
        else:
            if args.dry_run:
                print(f"would_expire org={org_id} plan={plan_id}")
                continue
            cancel_package_subscription(
                org_id,
                actor="system:local-expire",
                immediate=True,
                commerce=commerce,
                orgs=orgs,
                ops=ops,
            )
            print(f"expired org={org_id} plan={plan_id} -> demo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
