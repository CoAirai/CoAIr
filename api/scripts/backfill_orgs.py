#!/usr/bin/env python3
"""Place an existing customer's users and projects into an organization.

Dry-run is the default and prints exactly what would change. ``--apply`` writes,
recording a manifest so ``--revert`` can put every row back the way it was.

    python scripts/backfill_orgs.py --org "Acme Ltd" --owner acme-admin
    python scripts/backfill_orgs.py --org "Acme Ltd" --owner acme-admin --apply
    python scripts/backfill_orgs.py --revert storage/migrations/orgs/manifest-<ts>.json

What it attaches: every project the owner created or owns, and every other user
holding membership of those projects. It refuses — without writing anything —
when a candidate already belongs to a different organization, or a project
already belongs to one. Those are decisions for a human: moving a project
between companies retroactively changes who can read its documents.

Platform operator accounts (`admin` / `superadmin`) are never placed in an
organization: they are cross-company by construction, and an operator with an
organization is an ambiguous actor.

Legacy corpus accounts (`features["corpus"]`, e.g. edinburgh) are skipped by
default. Their documents predate projects and are addressed by the corpus tag,
so an organization cannot scope them; use --allow-legacy-corpus only when you
have confirmed the account's data carries project ids.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _manifest_dir() -> Path:
    from src.config import STORAGE_DIR

    path = Path(STORAGE_DIR) / "migrations" / "orgs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _plan(orgs, projects, users, owner: str, allow_legacy: bool):
    """What would move, and everything that blocks the move."""
    blockers: list[str] = []

    owner_record = users.get_user(owner)
    if not owner_record:
        blockers.append(f"user does not exist: {owner}")
        return {}, [], blockers
    if owner_record["role"] != "user":
        blockers.append(
            f"{owner} is a platform {owner_record['role']}; operators stay outside organizations"
        )

    candidate_projects = [
        p for p in projects.list_all(include_archived=True)
        if p["created_by"] == owner
        or any(m["username"] == owner and m["role"] == "owner"
               for m in projects.list_members(p["project_id"]))
    ]

    members: dict[str, str] = {owner: "owner"}
    for project in candidate_projects:
        if project.get("org_id"):
            blockers.append(
                f"project {project['project_id']} ({project['name']}) already belongs to "
                f"organization {project['org_id']}"
            )
        for member in projects.list_members(project["project_id"]):
            members.setdefault(member["username"], "member")

    for username in sorted(members):
        record = users.get_user(username)
        if not record:
            blockers.append(f"project member has no account: {username}")
            continue
        if record["role"] != "user":
            blockers.append(
                f"{username} is a platform {record['role']}; remove them from the "
                f"project or exclude the project"
            )
        corpus = (record.get("features") or {}).get("corpus")
        if corpus and not allow_legacy:
            blockers.append(
                f"{username} carries the legacy corpus tag '{corpus}'; its data predates "
                f"projects (pass --allow-legacy-corpus to override)"
            )
        existing = orgs.membership_for(username)
        if existing:
            blockers.append(
                f"{username} already belongs to organization "
                f"{existing['org_name']} ({existing['org_id']})"
            )
    return members, candidate_projects, blockers


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--org", help="Organization name to create.")
    ap.add_argument("--owner", help="Username to appoint as the company SuperAdmin.")
    ap.add_argument("--apply", action="store_true", help="Write the changes.")
    ap.add_argument("--revert", metavar="MANIFEST", help="Undo a previous --apply.")
    ap.add_argument("--allow-legacy-corpus", action="store_true")
    ap.add_argument("--default-credits", type=float, default=0)
    ap.add_argument("--default-token-limit", type=int, default=1_000_000)
    ap.add_argument("--default-storage-bytes", type=int, default=30_000_000_000)
    ap.add_argument("--project-limit", type=int, default=0)
    ap.add_argument("--allow-member-projects", action="store_true")
    args = ap.parse_args()

    from src.org_store import get_org_store
    from src.project_store import get_project_store
    from src.user_store import get_user_store

    orgs, projects, users = get_org_store(), get_project_store(), get_user_store()

    if args.revert:
        manifest = json.loads(Path(args.revert).read_text())
        for project_id, previous in manifest["projects"]:
            projects.set_org(project_id, previous, force=True)
        for username in manifest["members"]:
            orgs.remove_member(manifest["org_id"], username)
        orgs.archive_org(manifest["org_id"])
        print(f"reverted {len(manifest['projects'])} projects and "
              f"{len(manifest['members'])} memberships; "
              f"archived organization {manifest['org_id']}")
        return 0

    if not args.org or not args.owner:
        ap.error("--org and --owner are required unless --revert is used")

    members, candidate_projects, blockers = _plan(
        orgs, projects, users, args.owner, args.allow_legacy_corpus,
    )
    print(f"organization : {args.org}")
    print(f"owner        : {args.owner}")
    print(f"projects     : {len(candidate_projects)}")
    for project in candidate_projects:
        print(f"  - {project['project_id']}  {project['name']}")
    print(f"members      : {len(members)}")
    for username, role in sorted(members.items()):
        print(f"  - {username} ({role})")

    if blockers:
        print("\nrefusing to apply — resolve these first:", file=sys.stderr)
        for blocker in blockers:
            print(f"  ! {blocker}", file=sys.stderr)
        return 2

    if not args.apply:
        print("\ndry run — nothing written. Re-run with --apply.")
        return 0

    org = orgs.create_org(
        args.org, created_by="backfill", owner=args.owner,
        default_credits=args.default_credits,
        default_token_limit=args.default_token_limit,
        default_storage_bytes=args.default_storage_bytes,
        project_limit=args.project_limit,
        allow_member_projects=args.allow_member_projects,
    )
    for username, role in members.items():
        if username != args.owner:
            orgs.add_member(org["org_id"], username, role)
    moved = []
    for project in candidate_projects:
        projects.set_org(project["project_id"], org["org_id"])
        moved.append([project["project_id"], project.get("org_id")])

    from datetime import datetime, timezone

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    manifest_path = _manifest_dir() / f"manifest-{stamp}.json"
    manifest_path.write_text(json.dumps({
        "org_id": org["org_id"], "org_name": org["name"], "owner": args.owner,
        "members": sorted(members), "projects": moved,
    }, indent=2))
    print(f"\ncreated organization {org['name']} ({org['org_id']})")
    print(f"manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
