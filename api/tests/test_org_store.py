"""Organization records and membership — storage-level behaviour."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.org_store import OrgStore


@pytest.fixture()
def orgs(tmp_path):
    return OrgStore(db_path=tmp_path / "projects.db")


def test_create_org_seats_the_owner_in_one_transaction(orgs):
    org = orgs.create_org("Acme Ltd", created_by="platform", owner="acme-admin",
                          default_credits=500, project_limit=3)

    assert org["slug"] == "acme-ltd"
    assert org["default_credits"] == 500
    assert org["project_limit"] == 3
    assert orgs.list_members(org["org_id"]) == [
        {"username": "acme-admin", "role": "owner",
         "created_at": org["created_at"]},
    ]
    assert orgs.is_owner(org["org_id"], "acme-admin") is True


def test_duplicate_organization_name_is_rejected(orgs):
    orgs.create_org("Acme", created_by="platform")
    with pytest.raises(ValueError, match="already exists"):
        orgs.create_org("Acme", created_by="platform")


def test_a_user_belongs_to_exactly_one_organization(orgs):
    acme = orgs.create_org("Acme", created_by="platform", owner="shared-user")
    rival = orgs.create_org("Rival", created_by="platform")

    with pytest.raises(ValueError, match="already belongs"):
        orgs.add_member(rival["org_id"], "shared-user", "member")
    assert orgs.membership_for("shared-user")["org_id"] == acme["org_id"]


def test_add_member_doubles_as_change_role(orgs):
    org = orgs.create_org("Acme", created_by="platform")
    orgs.add_member(org["org_id"], "engineer", "member")
    orgs.add_member(org["org_id"], "engineer", "owner")

    assert orgs.membership_for("engineer")["role"] == "owner"
    assert orgs.count_owners(org["org_id"]) == 1


def test_membership_for_is_none_for_unaffiliated_users(orgs):
    assert orgs.membership_for("platform-admin") is None
    assert orgs.membership_for("") is None


def test_membership_for_carries_policy_and_archive_state(orgs):
    org = orgs.create_org("Acme", created_by="platform", owner="acme-admin",
                          allow_member_projects=True, default_plan_type="legacy")
    membership = orgs.membership_for("acme-admin")

    assert membership["org_name"] == "Acme"
    assert membership["allow_member_projects"] is True
    assert membership["default_plan_type"] == "legacy"
    assert membership["archived_at"] is None

    orgs.archive_org(org["org_id"])
    assert orgs.membership_for("acme-admin")["archived_at"] is not None


def test_membership_map_is_a_bulk_lookup(orgs):
    org = orgs.create_org("Acme", created_by="platform", owner="acme-admin")
    orgs.add_member(org["org_id"], "engineer", "member")

    everyone = orgs.membership_map()
    assert set(everyone) == {"acme-admin", "engineer"}
    assert everyone["engineer"]["org_name"] == "Acme"

    subset = orgs.membership_map(["engineer", "stranger"])
    assert set(subset) == {"engineer"}


def test_remove_member(orgs):
    org = orgs.create_org("Acme", created_by="platform", owner="acme-admin")
    orgs.add_member(org["org_id"], "engineer", "member")

    assert orgs.remove_member(org["org_id"], "engineer") is True
    assert orgs.membership_for("engineer") is None
    assert orgs.remove_member(org["org_id"], "engineer") is False


def test_add_member_to_unknown_organization_is_rejected(orgs):
    with pytest.raises(ValueError, match="organization not found"):
        orgs.add_member("does-not-exist", "engineer")


def test_invalid_role_is_rejected(orgs):
    org = orgs.create_org("Acme", created_by="platform")
    with pytest.raises(ValueError, match="invalid organization role"):
        orgs.add_member(org["org_id"], "engineer", "superadmin")


def test_update_org_renames_and_reslugs(orgs):
    org = orgs.create_org("Acme", created_by="platform")
    updated = orgs.update_org(org["org_id"], name="Acme Construction", project_limit=5)

    assert updated["name"] == "Acme Construction"
    assert updated["slug"] == "acme-construction"
    assert updated["project_limit"] == 5


def test_update_org_rejects_unknown_fields(orgs):
    org = orgs.create_org("Acme", created_by="platform")
    with pytest.raises(ValueError, match="cannot update fields"):
        orgs.update_org(org["org_id"], created_by="hijack")


def test_archived_organizations_drop_out_of_the_listing(orgs):
    org = orgs.create_org("Acme", created_by="platform")
    orgs.archive_org(org["org_id"])

    assert orgs.list_orgs() == []
    assert [o["name"] for o in orgs.list_orgs(include_archived=True)] == ["Acme"]
    assert orgs.archive_org(org["org_id"]) is False


def test_unarchive_restores_an_organization(orgs):
    org = orgs.create_org("Acme", created_by="platform")
    orgs.archive_org(org["org_id"])

    assert orgs.unarchive_org(org["org_id"]) is True
    assert [o["name"] for o in orgs.list_orgs()] == ["Acme"]
    assert orgs.get_org(org["org_id"])["archived_at"] is None
    assert orgs.unarchive_org(org["org_id"]) is False


def test_summary_counts_members_and_projects(orgs, tmp_path):
    from src.project_store import ProjectStore

    projects = ProjectStore(db_path=tmp_path / "projects.db")
    org = orgs.create_org("Acme", created_by="platform", owner="acme-admin")
    orgs.add_member(org["org_id"], "engineer", "member")
    projects.create_project("Live", "acme-admin", org_id=org["org_id"])
    archived = projects.create_project("Old", "acme-admin", org_id=org["org_id"])
    projects.archive(archived["project_id"])

    assert orgs.summary(org["org_id"]) == {
        "members": 2, "owners": 1, "projects": 1, "archived_projects": 1,
    }
