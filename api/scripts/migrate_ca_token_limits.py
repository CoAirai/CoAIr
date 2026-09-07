"""One-shot: align org/user token pools to CA micros from package query_cap.

Run on the API host after deploying CA token economics:

    python -m scripts.migrate_ca_token_limits

What it does:
  1. Forces package query_cap + economics via CommerceStore seed migration
  2. Sets each org default_token_limit = query_cap (CA) × 1_000_000 micros
  3. Rebalances member shares; resets used_tokens from ledger provider cost
     (CA micros) when ledger rows exist, otherwise leaves usage as-is
"""

from __future__ import annotations

import argparse

from src.billing_store import get_billing_store
from src.ca_tokens import ca_to_micros, nanos_to_ca_micros
from src.commerce_store import get_commerce_store
from src.org_quota import sync_org_member_quotas
from src.org_store import get_org_store
from src.user_store import get_user_store


from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ledger_ca_micros(username: str) -> int:
    billing = get_billing_store()
    total = 0
    offset = 0
    while True:
        page = billing.ledger(
            username, limit=500, offset=offset, event_types=("charge",)
        )
        entries = page.get("entries") or []
        if not entries:
            break
        for row in entries:
            ca = float(row.get("ca_tokens") or row.get("provider_cost_usd") or 0)
            total += ca_to_micros(ca)
        if offset + len(entries) >= int(page.get("total") or 0):
            break
        offset += len(entries)
    return total


def migrate(*, reset_usage_from_ledger: bool = True, dry_run: bool = False) -> None:
    commerce = get_commerce_store()
    economics = commerce.get_token_economics()
    print(
        "economics",
        economics.get("usd_per_ca_cost"),
        economics.get("usd_per_ca_sell"),
    )

    orgs = get_org_store()
    users = get_user_store()
    stamp = _now()
    for org in orgs.list_orgs(include_archived=True):
        org_id = org["org_id"]
        sub = commerce.get_subscription(org_id) or {}
        plan_id = str(sub.get("plan_id") or org.get("default_plan_type") or "demo")
        plan = commerce.get_plan(plan_id) or commerce.get_plan("demo") or {}
        ca_cap = int(plan.get("query_cap") or 0)
        micros = ca_to_micros(ca_cap)
        print(f"org={org_id} plan={plan_id} ca={ca_cap} micros={micros}")
        if dry_run:
            continue
        orgs.update_org(org_id, default_token_limit=micros)
        sync_org_member_quotas(
            org_id,
            token_limit=micros,
            orgs=orgs,
            users=users,
            commerce=commerce,
            reset_usage=False,
        )
        if reset_usage_from_ledger:
            for member in orgs.list_members(org_id):
                username = str(member.get("username") or "")
                if not username:
                    continue
                used = _ledger_ca_micros(username)
                with users._write_lock, users._connect() as conn:
                    conn.execute(
                        "DELETE FROM user_usage WHERE username=?", [username]
                    )
                    if used > 0:
                        conn.execute(
                            "INSERT INTO user_usage "
                            "(username, prompt_tokens, completion_tokens, "
                            "total_calls, updated_at) VALUES (?,?,?,?,?)",
                            [username, used, 0, 0, stamp],
                        )
                print(f"  user={username} used_ca_micros={used}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--keep-usage",
        action="store_true",
        help="Do not rewrite used_tokens from the billing ledger",
    )
    args = parser.parse_args()
    migrate(
        reset_usage_from_ledger=not args.keep_usage,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
