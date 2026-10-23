"""Check the real staging hostname, proxy, MFA, identity and project database."""
import argparse
import http.cookiejar
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.request


ROOT = Path("/opt/coair-integration")
ORIGIN = "https://coair-test.duckdns.org"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    credentials = json.loads((ROOT / ".access.json").read_text())
    workspace = json.loads((ROOT / "workspace.json").read_text())
    info = json.loads(subprocess.check_output(
        ["docker", "inspect", "coair-integration-api-1"], text=True,
    ))[0]
    assert info["Config"]["Image"] == "ghcr.io/coairai/coair-integration-api:" + args.commit
    for mount in info["Mounts"]:
        assert Path(mount["Source"]).is_relative_to(ROOT), "Unexpected runtime mount"
    try:
        urllib.request.urlopen(ORIGIN + "/coair-api/health", timeout=20)
    except urllib.error.HTTPError as error:
        assert error.code == 403, "API gate is not isolated"
    else:
        raise AssertionError("Unauthenticated request bypassed staging gate")
    passwords = urllib.request.HTTPPasswordMgrWithDefaultRealm()
    passwords.add_password(None, ORIGIN, credentials["basic_user"], credentials["basic_password"])
    cookies = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPBasicAuthHandler(passwords),
        urllib.request.HTTPCookieProcessor(cookies),
    )
    with opener.open(ORIGIN + "/auth/sign-in", timeout=30) as response:
        html = response.read().decode()
        assert "/_next/" in html, "Expected the Coair Next.js interface"
    assert any(cookie.name == "coair_integration_gate" for cookie in cookies)

    def api(path, data=None, token=None, project=None):
        headers = {"Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = "Bearer " + token
        if project:
            headers["X-Project-ID"] = project
        request = urllib.request.Request(
            ORIGIN + "/coair-api" + path, headers=headers,
            data=json.dumps(data).encode() if data is not None else None,
        )
        with opener.open(request, timeout=30) as response:
            return json.load(response)

    assert api("/health")["status"] == "ok"
    login = api("/auth/login", {"username": credentials["app_user"],
                                "password": credentials["app_password"]})
    assert login.get("mfa_required") and login.get("debug_code"), "Expected staging MFA"
    session = api("/auth/mfa/verify", {"mfa_token": login["mfa_token"], "code": login["debug_code"]})
    token = session["access_token"]
    assert session["user"]["username"] == credentials["app_user"]
    projects = api("/projects", token=token)["projects"]
    assert workspace["project_id"] in {project["project_id"] for project in projects}
    library = api("/library", token=token, project=workspace["project_id"])
    expected = {"CEC01546478.pdf", "CEC01123743.pdf", "CEC01630357.pdf"}
    assert expected.issubset({item["file_name"] for item in library}), "Baseline documents were lost"
    result = {"commit": args.commit, "public_origin": ORIGIN, "frontend": "Next.js",
              "api_gate": "passed", "password_mfa": "passed", "project_scope": "passed",
              "project_id": workspace["project_id"], "library_records": len(library)}
    (ROOT / "smoke.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
