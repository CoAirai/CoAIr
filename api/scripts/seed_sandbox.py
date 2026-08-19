#!/usr/bin/env python3
"""
Fill a sandbox with a company worth looking at.

One command, idempotent, so re-running after a code change is safe:

    python scripts/seed_sandbox.py
    python scripts/seed_sandbox.py --with-documents      # also ingest the sample files
    python scripts/seed_sandbox.py --org "Beta Ltd" --slug-prefix beta

It creates a platform operator, one customer company with its SuperAdmin and two
ordinary members, and two projects — with access deliberately uneven, so an
admin panel has a real access matrix to render on its first load rather than a
uniform one that hides bugs.

Passwords: pass `--password` to set one for every seeded account, or let the
script generate one and print it once. It never writes a password to disk.
"""
from __future__ import annotations

import argparse
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.org_store import get_org_store  # noqa: E402
from src.project_store import get_project_store  # noqa: E402
from src.user_store import get_user_store  # noqa: E402


def _ensure_user(users, username: str, password: str, *, role: str = "user",
                 display_name: str = "") -> str:
    """Create the account, or leave an existing one alone. Returns what happened."""
    existing = users.get_user(username)
    if existing:
        return "exists"
    users.create_user(
        username=username, password=password,
        display_name=display_name or username, role=role,
        # Operator accounts are unmetered; ordinary ones get the company's plan
        # applied below when they are placed in the organization.
        plan_type="legacy" if role in ("admin", "superadmin") else "demo",
        initial_credits=0 if role in ("admin", "superadmin") else 1000,
    )
    return "created"


def _ensure_org(orgs, name: str, owner: str, *, created_by: str) -> dict:
    existing = orgs.get_org_by_slug(_slug(name))
    if existing:
        return existing
    return orgs.create_org(
        name, created_by=created_by, owner=owner,
        default_plan_type="demo", default_credits=1000,
        default_token_limit=2_000_000, default_storage_bytes=30_000_000_000,
        project_limit=10, allow_member_projects=False,
    )


def _slug(value: str) -> str:
    from src.project_store import _slug as project_slug
    return project_slug(value)


def _ensure_project(projects, name: str, owner: str, org_id: str) -> dict:
    for project in projects.list_for_org(org_id):
        if project["name"] == name:
            return project
    return projects.create_project(name, owner, org_id=org_id)


def _ensure_dirs(project_id: str) -> None:
    from src.config import BASE_DIR, STORAGE_DIR

    for root in (Path(BASE_DIR) / "data" / "projects", Path(STORAGE_DIR) / "projects"):
        for child in ("documents", "emails", "tables", "reports", "jobs"):
            (root / project_id / child).mkdir(parents=True, exist_ok=True)


def _ingest_samples(project_id: str, owner: str, limit: int) -> int:
    """Push whatever sample files the image ships through the real ingestion path.

    Same code path as an upload, so the library, file list and search all end up
    in a genuine state rather than a fabricated one.
    """
    from src.config import BASE_DIR
    from src.project_context import set_current_project

    candidates = []
    for folder in ("documents", "emails", "tables"):
        source = Path(BASE_DIR) / "data" / folder
        if source.is_dir():
            candidates.extend(sorted(p for p in source.iterdir() if p.is_file()))
    if not candidates:
        print("  no sample files under data/ — skipping ingestion")
        return 0

    set_current_project(project_id, "editor")
    from src.file_router import route_file

    ingested = 0
    for path in candidates[:limit]:
        try:
            result = route_file(str(path), project_id=project_id)
            ok = getattr(result, "success", False)
            print(f"  {'ok  ' if ok else 'fail'} {path.name}")
            ingested += 1 if ok else 0
        except Exception as exc:  # a bad sample file must not abort the seed
            print(f"  fail {path.name}: {exc}")
    return ingested


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--org", default="Acme Construction", help="Company name.")
    ap.add_argument("--slug-prefix", default="acme",
                    help="Prefix for the seeded usernames, so a second company does not collide.")
    ap.add_argument("--password", default="",
                    help="Password for every seeded account. Generated and printed if omitted.")
    ap.add_argument("--with-documents", action="store_true",
                    help="Also ingest the sample files under data/ into the first project.")
    ap.add_argument("--document-limit", type=int, default=5)
    args = ap.parse_args()

    password = args.password or f"sandbox-{secrets.token_urlsafe(9)}"
    users, orgs, projects = get_user_store(), get_org_store(), get_project_store()

    operator = "ops"
    owner = f"{args.slug_prefix}-admin"
    engineer = f"{args.slug_prefix}-engineer"
    surveyor = f"{args.slug_prefix}-surveyor"

    print("accounts")
    for username, role, display in (
        (operator, "superadmin", "Platform Operator"),
        (owner, "user", "Company SuperAdmin"),
        (engineer, "user", "Site Engineer"),
        (surveyor, "user", "Quantity Surveyor"),
    ):
        print(f"  {_ensure_user(users, username, password, role=role, display_name=display):8} {username}")

    print("company")
    org = _ensure_org(orgs, args.org, owner, created_by=operator)
    print(f"  {org['name']} ({org['org_id']})")
    for username in (engineer, surveyor):
        try:
            orgs.add_member(org["org_id"], username, "member")
            print(f"  member   {username}")
        except ValueError as exc:
            print(f"  skipped  {username}: {exc}")

    print("projects")
    tower = _ensure_project(projects, "Tower A — Podium", owner, org["org_id"])
    annexe = _ensure_project(projects, "Annexe B — Fit-out", owner, org["org_id"])
    for project in (tower, annexe):
        _ensure_dirs(project["project_id"])
        print(f"  {project['name']} ({project['project_id']})")

    # Deliberately uneven: the engineer edits one project and cannot see the
    # other, the surveyor only reads. A panel built against uniform access
    # hides exactly the bugs this is here to expose.
    print("access")
    projects.add_member(tower["project_id"], engineer, "editor")
    projects.add_member(tower["project_id"], surveyor, "viewer")
    print(f"  {engineer:20} editor on {tower['name']}")
    print(f"  {surveyor:20} viewer on {tower['name']}")
    print(f"  {owner:20} owner  on both, through the company")

    if args.with_documents:
        print("documents")
        count = _ingest_samples(tower["project_id"], owner, args.document_limit)
        print(f"  {count} file(s) ingested into {tower['name']}")

    print()
    print("sign in at http://localhost:8000")
    print(f"  {owner:20} the company SuperAdmin — start here")
    print(f"  {engineer:20} member with access to one project")
    print(f"  {surveyor:20} member, read-only")
    print(f"  {operator:20} our platform operator (/api/admin/*)")
    if not args.password:
        print(f"\npassword for all of them: {password}")
        print("(shown once — it is not stored anywhere)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
