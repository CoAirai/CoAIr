"""
Organization visibility at the store level.

The company SuperAdmin (org `owner`) reaches every project of its own company
and nothing else. Membership still works exactly as before for everyone else,
and a project belonging to no organization is invisible to every org owner —
fail-closed, so an unmigrated row is a support ticket rather than a breach.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.org_store import OrgStore
from src.project_store import ProjectStore


@pytest.fixture()
def stores(tmp_path):
    db = tmp_path / "projects.db"
    return ProjectStore(db_path=db), OrgStore(db_path=db)


def _company(projects, orgs, name, owner, members=()):
    org = orgs.create_org(name, created_by="platform", owner=owner)
    for username in members:
        orgs.add_member(org["org_id"], username, "member")
    return org


# ── The core requirement ────────────────────────────────────


def test_org_owner_reaches_every_project_of_its_company(stores):
    projects, orgs = stores
    org = _company(projects, orgs, "Acme", "acme-admin", ["engineer"])

    own = projects.create_project("Tower A", "acme-admin", org_id=org["org_id"])
    projects.add_member(own["project_id"], "engineer", "editor")
    # Created by an engineer; the company SuperAdmin is not a member of it.
    other = projects.create_project("Tower B", "engineer", org_id=org["org_id"])

    visible = projects.list_visible("acme-admin")
    assert {p["name"] for p in visible} == {"Tower A", "Tower B"}

    reached = projects.get_visible(other["project_id"], "acme-admin")
    assert reached["role"] == "owner"
    assert reached["role_source"] == "org"


def test_member_sees_only_granted_projects(stores):
    projects, orgs = stores
    org = _company(projects, orgs, "Acme", "acme-admin", ["engineer"])
    granted = projects.create_project("Granted", "acme-admin", org_id=org["org_id"])
    withheld = projects.create_project("Withheld", "acme-admin", org_id=org["org_id"])
    projects.add_member(granted["project_id"], "engineer", "editor")

    assert [p["name"] for p in projects.list_visible("engineer")] == ["Granted"]
    assert projects.get_visible(withheld["project_id"], "engineer") is None
    assert projects.get_visible(granted["project_id"], "engineer")["role"] == "editor"


def test_one_company_never_sees_another(stores):
    projects, orgs = stores
    acme = _company(projects, orgs, "Acme", "acme-admin")
    rival = _company(projects, orgs, "Rival", "rival-admin")

    acme_project = projects.create_project("Acme Tower", "acme-admin", org_id=acme["org_id"])
    rival_project = projects.create_project("Rival Tower", "rival-admin", org_id=rival["org_id"])

    assert projects.get_visible(rival_project["project_id"], "acme-admin") is None
    assert projects.get_visible(acme_project["project_id"], "rival-admin") is None
    assert [p["name"] for p in projects.list_visible("acme-admin")] == ["Acme Tower"]


def test_unaffiliated_project_is_visible_to_nobody_but_its_members(stores):
    """A NULL org_id must fail closed. The permissive reading — 'no org means
    everyone' — is how a half-finished migration becomes a breach."""
    projects, orgs = stores
    org = _company(projects, orgs, "Acme", "acme-admin")
    orphan = projects.create_project("Orphan", "someone-else")

    assert projects.get_visible(orphan["project_id"], "acme-admin") is None
    assert projects.list_visible("acme-admin") == []
    # Its own member still reaches it — nothing regressed for existing projects.
    assert projects.get_visible(orphan["project_id"], "someone-else")["role"] == "owner"


def test_explicit_membership_is_reported_as_membership(stores):
    projects, orgs = stores
    org = _company(projects, orgs, "Acme", "acme-admin")
    project = projects.create_project("Tower", "acme-admin", org_id=org["org_id"])

    record = projects.get_visible(project["project_id"], "acme-admin")
    assert record["role_source"] == "member"
    assert record["role"] == "owner"


def test_archived_projects_drop_out_of_org_reach(stores):
    projects, orgs = stores
    org = _company(projects, orgs, "Acme", "acme-admin")
    project = projects.create_project("Tower", "acme-admin", org_id=org["org_id"])
    projects.archive(project["project_id"])

    assert projects.list_visible("acme-admin") == []
    assert [p["name"] for p in projects.list_visible("acme-admin", include_archived=True)] == ["Tower"]


# ── Cross-org grant guard ───────────────────────────────────


def test_cannot_grant_a_rival_companys_user_access(stores):
    projects, orgs = stores
    acme = _company(projects, orgs, "Acme", "acme-admin")
    _company(projects, orgs, "Rival", "rival-admin", ["rival-engineer"])
    project = projects.create_project("Acme Tower", "acme-admin", org_id=acme["org_id"])

    with pytest.raises(ValueError, match="cross_org_membership"):
        projects.add_member(project["project_id"], "rival-engineer", "editor")
    assert projects.get_visible(project["project_id"], "rival-engineer") is None


def test_cannot_grant_an_unaffiliated_user_into_a_company_project(stores):
    projects, orgs = stores
    acme = _company(projects, orgs, "Acme", "acme-admin")
    project = projects.create_project("Acme Tower", "acme-admin", org_id=acme["org_id"])

    with pytest.raises(ValueError, match="cross_org_membership"):
        projects.add_member(project["project_id"], "freelancer", "viewer")


def test_unaffiliated_projects_still_accept_unaffiliated_members(stores):
    """Existing installations have neither orgs nor org members; nothing there
    may start failing."""
    projects, _orgs = stores
    project = projects.create_project("Legacy", "alice")
    projects.add_member(project["project_id"], "bob", "editor")

    assert projects.get_visible(project["project_id"], "bob")["role"] == "editor"


# ── Membership primitives ───────────────────────────────────


def test_list_and_remove_members(stores):
    projects, orgs = stores
    org = _company(projects, orgs, "Acme", "acme-admin", ["engineer"])
    project = projects.create_project("Tower", "acme-admin", org_id=org["org_id"])
    projects.add_member(project["project_id"], "engineer", "viewer")

    assert {m["username"] for m in projects.list_members(project["project_id"])} == {
        "acme-admin", "engineer",
    }
    assert projects.remove_member(project["project_id"], "engineer") is True
    assert projects.get_visible(project["project_id"], "engineer") is None
    assert projects.remove_member(project["project_id"], "engineer") is False


def test_last_project_owner_cannot_be_removed(stores):
    projects, _orgs = stores
    project = projects.create_project("Tower", "alice")

    with pytest.raises(ValueError, match="last_project_owner"):
        projects.remove_member(project["project_id"], "alice")


# ── Org roster and assignment ───────────────────────────────


def test_list_for_org_reports_member_counts(stores):
    projects, orgs = stores
    org = _company(projects, orgs, "Acme", "acme-admin", ["engineer"])
    project = projects.create_project("Tower", "acme-admin", org_id=org["org_id"])
    projects.add_member(project["project_id"], "engineer", "viewer")

    roster = projects.list_for_org(org["org_id"])
    assert [(p["name"], p["member_count"]) for p in roster] == [("Tower", 2)]
    assert projects.count_for_org(org["org_id"]) == 1
    assert projects.list_for_org("") == []


def test_set_org_refuses_to_move_a_project_between_companies(stores):
    projects, orgs = stores
    acme = _company(projects, orgs, "Acme", "acme-admin")
    rival = _company(projects, orgs, "Rival", "rival-admin")
    project = projects.create_project("Tower", "acme-admin", org_id=acme["org_id"])

    with pytest.raises(ValueError, match="another organization"):
        projects.set_org(project["project_id"], rival["org_id"])
    assert projects.get(project["project_id"])["org_id"] == acme["org_id"]


def test_set_org_adopts_an_unaffiliated_project(stores):
    projects, orgs = stores
    acme = _company(projects, orgs, "Acme", "acme-admin")
    project = projects.create_project("Legacy", "acme-admin")

    assert projects.get_visible(project["project_id"], "acme-admin")["role_source"] == "member"
    projects.set_org(project["project_id"], acme["org_id"])
    assert projects.get_for_org(project["project_id"], acme["org_id"])["name"] == "Legacy"


# ── Migration ───────────────────────────────────────────────


def test_existing_database_gains_org_id_by_alter(tmp_path):
    """A deployed projects.db already has the table, so CREATE TABLE IF NOT
    EXISTS would not add the column and every later query would fail."""
    db = tmp_path / "projects.db"
    conn = sqlite3.connect(db)
    conn.executescript(
        """
        CREATE TABLE projects (
            project_id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
            embedding_profile TEXT NOT NULL DEFAULT 'local-bge-v1',
            created_by TEXT NOT NULL, created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL, archived_at TEXT);
        INSERT INTO projects VALUES
            ('old1','Existing','existing','local-bge-v1','alice','t','t',NULL);
        CREATE TABLE project_members (
            project_id TEXT NOT NULL, username TEXT NOT NULL, role TEXT NOT NULL,
            created_at TEXT NOT NULL, PRIMARY KEY(project_id, username));
        INSERT INTO project_members VALUES ('old1','alice','owner','t');
        """
    )
    conn.commit()
    conn.close()

    store = ProjectStore(db_path=db)

    assert store.get("old1")["org_id"] is None
    assert [p["name"] for p in store.list_for_user("alice")] == ["Existing"]
    assert store.get_visible("old1", "alice")["role"] == "owner"
    # And creating a project still works after the column was added — the
    # positional INSERT that used to be here would raise here.
    assert store.create_project("New", "alice")["org_id"] is None
