"""
The company SuperAdmin surface, driven through the real routers.

A company's owner administers its own company and nothing else: it creates the
company's users, grants them access to the company's projects, and is refused —
always with the same shapes — the moment it reaches for another company, for
platform routes, or for powers we did not give it.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ.setdefault("JWT_SECRET", "test-secret-please-replace-in-prod")


@pytest.fixture()
def stores(tmp_path, monkeypatch):
    from src import commerce_store as commerce_store_module
    from src import ops_store as ops_store_module
    from src import org_store as org_store_module
    from src import project_store as project_store_module
    from src import user_store as user_store_module

    users = user_store_module.UserStore(db_path=tmp_path / "users.db")
    projects = project_store_module.ProjectStore(db_path=tmp_path / "projects.db")
    orgs = org_store_module.OrgStore(db_path=tmp_path / "projects.db")
    commerce = commerce_store_module.CommerceStore(db_path=tmp_path / "commerce.db")
    ops = ops_store_module.OpsStore(db_path=tmp_path / "ops.db")
    monkeypatch.setattr(user_store_module.UserStore, "_instance", users)
    monkeypatch.setattr(project_store_module.ProjectStore, "_instance", projects)
    monkeypatch.setattr(org_store_module.OrgStore, "_instance", orgs)
    monkeypatch.setattr(commerce_store_module.CommerceStore, "_instance", commerce)
    monkeypatch.setattr(ops_store_module.OpsStore, "_instance", ops)
    # get_billing_store() is its own singleton and would otherwise open the real
    # storage/users.db instead of this test's.
    from src import billing_store as billing_store_module
    monkeypatch.setattr(billing_store_module.BillingStore, "_instance", users.billing)
    return users, projects, orgs


@pytest.fixture()
def client(stores):
    from backend.api import admin_orgs, admin_users, auth as auth_router, org_admin, projects
    from backend.core.security import get_current_user, require_admin

    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api")
    app.include_router(org_admin.router, prefix="/api",
                       dependencies=[Depends(get_current_user)])
    app.include_router(projects.router, prefix="/api",
                       dependencies=[Depends(get_current_user)])
    app.include_router(admin_orgs.router, prefix="/api",
                       dependencies=[Depends(require_admin)])
    app.include_router(admin_users.router, prefix="/api",
                       dependencies=[Depends(require_admin)])
    return TestClient(app)


def _auth(client, username, password="pw"):
    login = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    ).json()
    if login.get("mfa_required"):
        code = login.get("debug_code")
        assert code, "expected debug MFA code in tests"
        login = client.post(
            "/api/auth/mfa/verify",
            json={"mfa_token": login["mfa_token"], "code": code},
        ).json()
    return {"Authorization": f"Bearer {login['access_token']}"}


@pytest.fixture()
def acme(stores, client):
    """A company with an owner, an engineer and one project."""
    users, projects, orgs = stores
    users.create_user("acme-admin", "pw", role="user")
    users.create_user("engineer", "pw", role="user")
    org = orgs.create_org("Acme", created_by="platform", owner="acme-admin",
                          default_credits=250, default_token_limit=500_000)
    orgs.add_member(org["org_id"], "engineer", "member")
    project = projects.create_project("Tower", "acme-admin", org_id=org["org_id"])
    return {"org": org, "project": project}


@pytest.fixture()
def rival(stores):
    users, projects, orgs = stores
    users.create_user("rival-admin", "pw", role="user")
    users.create_user("rival-engineer", "pw", role="user")
    org = orgs.create_org("Rival", created_by="platform", owner="rival-admin")
    orgs.add_member(org["org_id"], "rival-engineer", "member")
    project = projects.create_project("Rival Tower", "rival-admin", org_id=org["org_id"])
    return {"org": org, "project": project}


# ── What the company SuperAdmin can do ──────────────────────


def test_owner_reads_its_own_company(client, acme):
    body = client.get("/api/org", headers=_auth(client, "acme-admin")).json()

    assert body["org"]["name"] == "Acme"
    assert body["role"] == "owner"
    assert body["counts"] == {"members": 2, "owners": 1, "projects": 1,
                              "archived_projects": 0}


def test_owner_creates_a_user_on_the_company_plan(client, acme, stores):
    users, _projects, orgs = stores
    resp = client.post("/api/org/users", headers=_auth(client, "acme-admin"), json={
        "username": "surveyor", "password": "pw123456",
        "display_name": "Site Surveyor", "features": {"correspondence": True},
    })

    assert resp.status_code == 201
    body = resp.json()
    assert body["display_name"] == "Site Surveyor"
    assert body["org_role"] == "member"
    # Plan, credits and quota come from the company policy, not the request.
    assert body["credits_total"] == 250
    assert body["token_limit"] == 500_000
    # Always a plain account, and inside the caller's company.
    assert users.get_user("surveyor")["role"] == "user"
    assert orgs.membership_for("surveyor")["org_id"] == acme["org"]["org_id"]


def test_owner_grants_and_revokes_project_access(client, acme, stores):
    _users, projects, _orgs = stores
    project_id = acme["project"]["project_id"]
    headers = _auth(client, "acme-admin")

    assert projects.get_visible(project_id, "engineer") is None
    granted = client.put(f"/api/org/projects/{project_id}/members/engineer",
                         headers=headers, json={"role": "editor"})
    assert granted.status_code == 200
    assert projects.get_visible(project_id, "engineer")["role"] == "editor"

    members = client.get(f"/api/org/projects/{project_id}/members", headers=headers).json()
    assert {m["username"] for m in members["members"]} == {"acme-admin", "engineer"}

    revoked = client.delete(f"/api/org/projects/{project_id}/members/engineer",
                            headers=headers)
    assert revoked.status_code == 204
    assert projects.get_visible(project_id, "engineer") is None


def test_owner_sees_every_project_of_the_company(client, acme, stores):
    _users, projects, _orgs = stores
    # Created by the engineer; the owner is not a member of it.
    projects.create_project("Annexe", "engineer", org_id=acme["org"]["org_id"])

    listed = client.get("/api/org/projects", headers=_auth(client, "acme-admin")).json()
    assert {p["name"] for p in listed["projects"]} == {"Tower", "Annexe"}

    visible = client.get("/api/projects", headers=_auth(client, "acme-admin")).json()
    assert {p["name"] for p in visible["projects"]} == {"Tower", "Annexe"}


def test_member_sees_only_granted_projects(client, acme, stores):
    _users, projects, _orgs = stores
    projects.create_project("Annexe", "acme-admin", org_id=acme["org"]["org_id"])
    projects.add_member(acme["project"]["project_id"], "engineer", "viewer")

    visible = client.get("/api/projects", headers=_auth(client, "engineer")).json()
    assert [p["name"] for p in visible["projects"]] == ["Tower"]


# ── What it cannot do ───────────────────────────────────────


def test_owner_cannot_mint_an_operator_account(client, acme, stores):
    users, _projects, _orgs = stores
    resp = client.post("/api/org/users", headers=_auth(client, "acme-admin"), json={
        "username": "backdoor", "password": "pw123456", "role": "superadmin",
    })

    # `role` is not part of the contract, so it is ignored, not honoured.
    assert resp.status_code == 201
    assert users.get_user("backdoor")["role"] == "user"


def test_owner_cannot_mint_credits_or_quota(client, acme):
    resp = client.post("/api/org/users", headers=_auth(client, "acme-admin"), json={
        "username": "greedy", "password": "pw123456",
        "initial_credits": 999999, "token_limit": 999999999,
    })

    assert resp.status_code == 201
    assert resp.json()["credits_total"] == 250
    assert resp.json()["token_limit"] == 500_000


def test_owner_cannot_assign_the_legacy_corpus_feature(client, acme, stores):
    """`corpus` selects a bulk document set that predates projects, so it is not
    a company's to hand out."""
    users, _projects, _orgs = stores
    created = client.post("/api/org/users", headers=_auth(client, "acme-admin"), json={
        "username": "curious", "password": "pw123456",
        "features": {"corpus": True, "correspondence": True},
    })

    assert created.status_code == 201
    features = users.get_user("curious")["features"]
    assert "corpus" not in features
    assert features["correspondence"] is True

    # A string value is rejected outright by the contract, so the account that
    # would carry it is never created either.
    rejected = client.post("/api/org/users", headers=_auth(client, "acme-admin"), json={
        "username": "curious2", "password": "pw123456",
        "features": {"corpus": "edinburgh"},
    })
    assert rejected.status_code == 422
    assert users.get_user("curious2") is None


def test_owner_is_not_a_platform_admin(client, acme):
    headers = _auth(client, "acme-admin")

    assert client.get("/api/admin/users", headers=headers).status_code == 403
    assert client.get("/api/admin/orgs", headers=headers).status_code == 403


def test_owner_cannot_touch_another_companys_user(client, acme, rival):
    headers = _auth(client, "acme-admin")

    # 404, not 403: usernames elsewhere on the platform must not be probeable.
    assert client.patch("/api/org/users/rival-engineer", headers=headers,
                        json={"is_active": False}).status_code == 404
    assert client.delete("/api/org/users/rival-engineer", headers=headers).status_code == 404


def test_owner_cannot_reach_another_companys_project(client, acme, rival):
    headers = _auth(client, "acme-admin")
    rival_project = rival["project"]["project_id"]

    assert client.get(f"/api/org/projects/{rival_project}/members",
                      headers=headers).status_code == 404
    assert client.put(f"/api/org/projects/{rival_project}/members/engineer",
                      headers=headers, json={"role": "owner"}).status_code == 404


def test_owner_cannot_pull_a_rival_companys_user_into_its_project(client, acme, rival, stores):
    _users, projects, _orgs = stores
    project_id = acme["project"]["project_id"]

    resp = client.put(f"/api/org/projects/{project_id}/members/rival-engineer",
                      headers=_auth(client, "acme-admin"), json={"role": "viewer"})

    assert resp.status_code == 422
    assert resp.json()["detail"] == "user_not_in_organization"
    assert projects.get_visible(project_id, "rival-engineer") is None


def test_the_store_refuses_a_cross_company_grant_even_via_the_project_route(client, acme, rival):
    """The guard lives in the store, so the older project route cannot bypass it."""
    project_id = acme["project"]["project_id"]
    resp = client.post(
        f"/api/projects/{project_id}/members",
        headers={**_auth(client, "acme-admin"), "X-Project-ID": project_id},
        json={"username": "rival-engineer", "role": "editor"},
    )

    assert resp.status_code == 422
    assert resp.json()["detail"] == "cross_org_membership"


def test_plain_member_cannot_administer_the_company(client, acme):
    headers = _auth(client, "engineer")

    assert client.get("/api/org/users", headers=headers).status_code == 403
    assert client.post("/api/org/users", headers=headers,
                       json={"username": "x", "password": "pw123456"}).status_code == 403
    assert client.get("/api/org/projects", headers=headers).status_code == 403
    # But it can still read which company it is in.
    assert client.get("/api/org", headers=headers).json()["role"] == "member"


def test_unaffiliated_user_has_no_company(client, stores):
    users, _projects, _orgs = stores
    users.create_user("freelancer", "pw", role="user")

    resp = client.get("/api/org", headers=_auth(client, "freelancer"))
    assert resp.status_code == 403
    assert resp.json()["detail"] == "organization_required"


def test_x_org_id_header_is_ignored_for_non_operators(client, acme, rival):
    """Honouring it for anyone else would be a complete cross-company bypass."""
    resp = client.get("/api/org", headers={
        **_auth(client, "acme-admin"), "X-Org-ID": rival["org"]["org_id"],
    })

    assert resp.json()["org"]["name"] == "Acme"


def test_last_owner_is_protected(client, acme):
    headers = _auth(client, "acme-admin")

    assert client.patch("/api/org/users/acme-admin", headers=headers,
                        json={"org_role": "member"}).status_code == 403  # own role
    assert client.delete("/api/org/users/acme-admin", headers=headers).status_code == 403

    # Promote the engineer, and only then may the original owner step down.
    assert client.patch("/api/org/users/engineer", headers=headers,
                        json={"org_role": "owner"}).status_code == 200
    assert client.patch("/api/org/users/acme-admin", headers=_auth(client, "engineer"),
                        json={"org_role": "member"}).status_code == 200


def test_owner_can_grant_module_rights_without_dropping_correspondence(client, acme, stores):
    users, _projects, _orgs = stores
    created = client.post("/api/org/users", headers=_auth(client, "acme-admin"), json={
        "username": "rights-user", "password": "pw123456",
        "features": {"correspondence": True},
    })
    assert created.status_code == 201
    patched = client.patch(
        "/api/org/users/rights-user",
        headers=_auth(client, "acme-admin"),
        json={"features": {"forensic": True, "download": True}},
    )
    assert patched.status_code == 200
    features = users.get_user("rights-user")["features"]
    assert features["correspondence"] is True
    assert features["forensic"] is True
    assert features["download"] is True
    assert "corpus" not in features


def test_platform_admin_patch_merges_module_rights(client, stores, acme):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")
    users.update_user("engineer", features={"correspondence": True, "corpus": True})
    resp = client.patch(
        "/api/admin/users/engineer",
        headers=_auth(client, "ops"),
        json={"features": {"forensic": True, "download": False}},
    )
    assert resp.status_code == 200
    features = users.get_user("engineer")["features"]
    assert features["correspondence"] is True
    assert features["corpus"] is True
    assert features["forensic"] is True
    assert features["download"] is False


def test_platform_admin_cannot_demote_last_owner(client, stores, acme):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")
    org_id = acme["org"]["org_id"]
    resp = client.post(
        f"/api/admin/orgs/{org_id}/members",
        headers=_auth(client, "ops"),
        json={"username": "acme-admin", "role": "member"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "last_org_owner"


# ── Platform operators ──────────────────────────────────────


def test_platform_admin_create_demo_org_uses_package_storage(client, stores):
    from src.commerce_store import gb_to_bytes, plan_org_defaults

    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")
    users.create_user("demo-owner", "pw", role="user")
    headers = _auth(client, "ops")
    expected = plan_org_defaults("demo")

    created = client.post("/api/admin/orgs", headers=headers, json={
        "name": "Demo Ltd",
        "owner_username": "demo-owner",
        "default_plan_type": "demo",
    })
    assert created.status_code == 201
    body = created.json()
    assert body["default_storage_bytes"] == expected["default_storage_bytes"]
    assert body["default_storage_bytes"] == gb_to_bytes(20)
    assert body["default_credits"] == expected["default_credits"]
    from src.commerce_store import get_commerce_store
    sub = get_commerce_store().get_subscription(body["org_id"])
    assert sub["plan_id"] == "demo"
    assert sub["needs_checkout"] is True


def test_platform_admin_create_demo_user_uses_package_limits(client, stores):
    from src.commerce_store import plan_org_defaults

    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")
    headers = _auth(client, "ops")
    expected = plan_org_defaults("demo")

    created = client.post("/api/admin/users", headers=headers, json={
        "username": "packaged-user",
        "password": "pw123456",
        "role": "user",
        "plan_type": "demo",
    })
    assert created.status_code == 201
    body = created.json()
    assert body["storage_limit_bytes"] == expected["default_storage_bytes"]
    assert body["credits_total"] == expected["default_credits"]


def test_platform_admin_creates_a_company_and_appoints_its_superadmin(client, stores):
    users, _projects, orgs = stores
    users.create_user("ops", "pw", role="admin")
    users.create_user("new-owner", "pw", role="user")
    headers = _auth(client, "ops")

    created = client.post("/api/admin/orgs", headers=headers, json={
        "name": "Beta Ltd", "owner_username": "new-owner", "default_credits": 100,
        "project_limit": 1,
    })
    assert created.status_code == 201
    org_id = created.json()["org_id"]
    assert orgs.membership_for("new-owner") == {
        **orgs.membership_for("new-owner"), "org_id": org_id, "role": "owner",
    }

    listed = client.get("/api/admin/orgs", headers=headers).json()
    assert [o["name"] for o in listed["orgs"]] == ["Beta Ltd"]


def test_platform_admin_can_archive_and_restore_a_company(client, stores):
    users, _projects, orgs = stores
    users.create_user("ops", "pw", role="admin")
    headers = _auth(client, "ops")
    org = orgs.create_org("Acme", created_by="platform")
    org_id = org["org_id"]

    archived = client.patch(
        f"/api/admin/orgs/{org_id}", headers=headers, json={"archived": True},
    )
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert client.get("/api/admin/orgs", headers=headers).json()["orgs"] == []

    restored = client.patch(
        f"/api/admin/orgs/{org_id}", headers=headers, json={"archived": False},
    )
    assert restored.status_code == 200
    assert restored.json()["archived_at"] is None
    listed = client.get("/api/admin/orgs", headers=headers).json()
    assert [o["name"] for o in listed["orgs"]] == ["Acme"]


def test_platform_admin_acts_inside_a_company_with_the_header(client, acme, stores):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")
    headers = _auth(client, "ops")

    without = client.get("/api/org/users", headers=headers)
    assert without.status_code == 403

    inside = client.get("/api/org/users",
                        headers={**headers, "X-Org-ID": acme["org"]["org_id"]})
    assert {u["username"] for u in inside.json()["users"]} == {"acme-admin", "engineer"}


def test_platform_admin_still_sees_every_project(client, acme, rival, stores):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")

    listed = client.get("/api/projects", headers=_auth(client, "ops")).json()
    assert {p["name"] for p in listed["projects"]} == {"Tower", "Rival Tower"}


def test_admin_users_listing_carries_org_fields_and_filters(client, acme, rival, stores):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")
    headers = _auth(client, "ops")

    everyone = client.get("/api/admin/users", headers=headers).json()["users"]
    by_name = {u["username"]: u for u in everyone}
    assert by_name["acme-admin"]["org_name"] == "Acme"
    assert by_name["acme-admin"]["org_role"] == "owner"
    assert by_name["ops"]["org_id"] is None

    filtered = client.get(f"/api/admin/users?org_id={acme['org']['org_id']}",
                          headers=headers).json()["users"]
    assert {u["username"] for u in filtered} == {"acme-admin", "engineer"}


def test_project_limit_is_enforced(client, stores):
    users, _projects, orgs = stores
    users.create_user("small-admin", "pw", role="user")
    org = orgs.create_org("Small", created_by="platform", owner="small-admin",
                          project_limit=1)
    headers = _auth(client, "small-admin")

    first = client.post("/api/projects", headers=headers, json={"name": "One"})
    assert first.status_code == 201
    assert first.json()["org_id"] == org["org_id"]

    second = client.post("/api/projects", headers=headers, json={"name": "Two"})
    assert second.status_code == 409
    assert second.json()["detail"] == "org_project_limit_reached"


def test_members_cannot_create_projects_unless_allowed(client, acme, stores):
    _users, _projects, orgs = stores

    denied = client.post("/api/projects", headers=_auth(client, "engineer"),
                         json={"name": "Rogue"})
    assert denied.status_code == 403
    assert denied.json()["detail"] == "org_owner_required"

    orgs.update_org(acme["org"]["org_id"], allow_member_projects=True)
    allowed = client.post("/api/projects", headers=_auth(client, "engineer"),
                          json={"name": "Sanctioned"})
    assert allowed.status_code == 201
    assert allowed.json()["org_id"] == acme["org"]["org_id"]


def test_unaffiliated_accounts_keep_creating_projects_freely(client, stores):
    """Nothing may change for installations that have no organizations yet."""
    users, _projects, _orgs = stores
    users.create_user("freelancer", "pw", role="user")
    headers = _auth(client, "freelancer")

    for name in ("One", "Two", "Three"):
        created = client.post("/api/projects", headers=headers, json={"name": name})
        assert created.status_code == 201
        assert created.json()["org_id"] is None


def test_assigning_a_project_with_outside_members_is_refused(client, acme, stores):
    users, projects, orgs = stores
    users.create_user("ops", "pw", role="admin")
    users.create_user("outsider", "pw", role="user")
    orphan = projects.create_project("Legacy", "outsider")

    resp = client.post(
        f"/api/admin/orgs/{acme['org']['org_id']}/projects/{orphan['project_id']}",
        headers=_auth(client, "ops"),
    )

    assert resp.status_code == 409
    assert resp.json()["detail"]["error"] == "members_outside_organization"
    assert resp.json()["detail"]["unaffiliated"] == ["outsider"]
    assert projects.get(orphan["project_id"])["org_id"] is None


# ── Endpoints the panel asked for ───────────────────────────


def test_user_list_pages_and_reports_the_filtered_total(client, acme, stores):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")
    for i in range(6):
        users.create_user(f"bulk{i}", "pw", role="user")
    headers = _auth(client, "ops")

    first = client.get("/api/admin/users?limit=4&offset=0", headers=headers).json()
    second = client.get("/api/admin/users?limit=4&offset=4", headers=headers).json()

    assert first["total"] == second["total"] == len(users.list_users())
    assert len(first["users"]) == 4
    # Contiguous, non-overlapping pages.
    assert not {u["username"] for u in first["users"]} & {u["username"] for u in second["users"]}


def test_user_list_search_matches_username_and_display_name(client, stores):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")
    users.create_user("acme-site", "pw", role="user", display_name="Site Engineer")
    users.create_user("unrelated", "pw", role="user", display_name="Nobody")
    headers = _auth(client, "ops")

    by_username = client.get("/api/admin/users?q=acme", headers=headers).json()
    assert {u["username"] for u in by_username["users"]} == {"acme-site"}
    assert by_username["total"] == 1

    by_display = client.get("/api/admin/users?q=engineer", headers=headers).json()
    assert {u["username"] for u in by_display["users"]} == {"acme-site"}

    assert client.get("/api/admin/users?q=nothingmatches", headers=headers).json() == {
        "users": [], "total": 0, "limit": 100, "offset": 0,
    }


def test_user_list_search_combines_with_the_company_filter(client, acme, rival, stores):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")

    scoped = client.get(
        f"/api/admin/users?org_id={acme['org']['org_id']}&q=admin",
        headers=_auth(client, "ops"),
    ).json()

    assert {u["username"] for u in scoped["users"]} == {"acme-admin"}


def test_ledger_explains_a_balance(client, acme, stores):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")
    headers = _auth(client, "ops")
    client.post("/api/admin/users/engineer/credits", headers=headers,
                json={"credits": 250, "reason": "Pilot top-up"})
    client.post("/api/admin/users/engineer/credits", headers=headers,
                json={"credits": -50, "reason": "Correction"})

    body = client.get("/api/admin/users/engineer/ledger", headers=headers).json()

    assert body["total"] == 2
    assert [e["note"] for e in body["entries"]] == ["Correction", "Pilot top-up"]
    assert [e["retail_credit"] for e in body["entries"]] == [-50.0, 250.0]
    # Paging works on it.
    page = client.get("/api/admin/users/engineer/ledger?limit=1&offset=1",
                      headers=headers).json()
    assert len(page["entries"]) == 1 and page["total"] == 2


def test_ledger_404s_for_an_unknown_account(client, stores):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")

    resp = client.get("/api/admin/users/ghost/ledger", headers=_auth(client, "ops"))
    assert resp.status_code == 404


def test_ledger_is_not_a_company_route(client, acme):
    """Credits stay a platform matter, so a company admin cannot read the ledger."""
    assert client.get("/api/admin/users/engineer/ledger",
                      headers=_auth(client, "acme-admin")).status_code == 403


def test_company_spend_covers_its_own_projects_only(client, acme, rival, stores):
    users, _projects, _orgs = stores
    ledger = users.billing

    mine = acme["project"]["project_id"]
    theirs = rival["project"]["project_id"]
    for project_id, username in ((mine, "engineer"), (theirs, "rival-engineer")):
        ledger.record_charge(
            username=username, project_id=project_id, provider="gemini",
            model="gemini-3.6-flash", task_type="chat", prompt_tokens=1000,
            completion_tokens=100,
        )

    body = client.get("/api/org/usage", headers=_auth(client, "acme-admin")).json()

    assert {g["project_id"] for g in body["groups"]} == {mine}
    assert body["totals"]["calls"] == 1
    assert body["totals"]["prompt_tokens"] == 1000


def test_company_spend_never_exposes_our_cost_basis(client, acme, stores):
    users, _projects, _orgs = stores
    users.billing.record_charge(
        username="engineer", project_id=acme["project"]["project_id"],
        provider="gemini", model="gemini-3.6-flash", task_type="chat",
        prompt_tokens=500, completion_tokens=50,
    )

    body = client.get("/api/org/usage", headers=_auth(client, "acme-admin")).json()

    for group in body["groups"]:
        assert "estimated_provider_cost_usd" not in group
        assert "uncovered_provider_cost_usd" not in group
        assert "markup_percent" not in group
        assert "retail_credit" not in group


def test_company_spend_is_owner_only_and_zero_when_empty(client, acme):
    assert client.get("/api/org/usage", headers=_auth(client, "engineer")).status_code == 403

    body = client.get("/api/org/usage", headers=_auth(client, "acme-admin")).json()
    assert body["totals"] == {"calls": 0, "prompt_tokens": 0,
                             "completion_tokens": 0, "credits_used": 0.0}


def test_impersonate_and_force_logout(client, stores, acme):
    users, _projects, _orgs = stores
    users.create_user("ops", "pw", role="admin")
    ops = _auth(client, "ops")
    engineer = _auth(client, "engineer")
    assert client.get("/api/projects", headers=engineer).status_code == 200

    assert client.post(
        "/api/admin/users/ops/impersonate", headers=ops
    ).status_code == 403
    assert client.post(
        "/api/admin/users/ops/impersonate", headers=engineer
    ).status_code == 403

    impersonated = client.post(
        "/api/admin/users/engineer/impersonate", headers=ops
    )
    assert impersonated.status_code == 200
    body = impersonated.json()
    assert body["impersonator"] == "ops"
    as_engineer = {"Authorization": f"Bearer {body['access_token']}"}
    assert client.get("/api/projects", headers=as_engineer).status_code == 200
    assert client.get("/api/admin/users", headers=as_engineer).status_code == 403

    kicked = client.post("/api/admin/users/engineer/force-logout", headers=ops)
    assert kicked.status_code == 200
    assert client.get("/api/projects", headers=engineer).status_code == 401
    assert client.get("/api/projects", headers=as_engineer).status_code == 401
    fresh = _auth(client, "engineer")
    assert client.get("/api/projects", headers=fresh).status_code == 200
