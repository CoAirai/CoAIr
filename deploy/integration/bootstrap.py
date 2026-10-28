"""Create a real, isolated test user/company/project; credentials arrive on stdin."""
import json
import os
import sys


def main():
    if os.getenv("COAIR_INTEGRATION") != "1":
        raise SystemExit("Refusing to bootstrap outside the integration environment")
    from src.user_store import get_user_store
    from src.org_store import get_org_store
    from src.project_store import get_project_store
    from src.ops_store import get_ops_store

    credentials = json.load(sys.stdin)
    username = credentials["app_user"]
    users = get_user_store()
    if not users.get_user(username):
        users.create_user(
            username, credentials["app_password"], display_name="Coair Test",
            role="user", token_limit=50_000_000, plan_type="demo",
            initial_credits=5000, model_policy="demo-tiered-quality-v2",
            features={name: True for name in (
                "projectAccess", "chronology", "forensic", "upload",
                "download", "reports", "correspondence",
            )},
        )
    orgs = get_org_store()
    org = orgs.get_org_by_slug("coair-test") or orgs.create_org(
        "Coair Test", created_by=username, owner=username,
        default_token_limit=50_000_000, default_credits=5000,
        project_limit=5, allow_member_projects=False,
    )
    for module in ("chronology", "forensic"):
        get_ops_store().set_org_module_grant(org["org_id"], module, True)
    projects = get_project_store()
    project = next((p for p in projects.list_for_org(org["org_id"])
                    if p["name"] == "Edinburgh — integration sample"), None)
    if not project:
        project = projects.create_project(
            "Edinburgh — integration sample", username, org_id=org["org_id"],
        )
    print(json.dumps({"username": username, "org_id": org["org_id"],
                      "project_id": project["project_id"]}))


if __name__ == "__main__":
    main()
