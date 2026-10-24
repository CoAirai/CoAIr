"""Check the real staging hostname, proxy, MFA, identity and project database."""
import argparse
import http.cookiejar
import io
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile


ROOT = Path("/opt/coair-integration")
ORIGIN = "https://coair-test.duckdns.org"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", required=True)
    parser.add_argument("--chat", action="store_true",
                        help="Also run one real, billable staging AI query")
    parser.add_argument("--chronology", action="store_true",
                        help="Also generate and inspect one real, billable staging Word report")
    parser.add_argument("--retry-report", default="", help="Retry this existing staging report during qualification")
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
        with opener.open(request, timeout=120) as response:
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
    reports = api("/reports?module=chronology", token=token, project=workspace["project_id"])
    assert all(job["status"] != "failed" for job in reports["reports"]), "Failed jobs leaked into the normal list"
    preview = api("/docs/161298c26281926a/content?anchor=page_1&file_name=CEC01546478.pdf",
                  token=token, project=workspace["project_id"])
    assert preview.get("type") == "pdf" and preview.get("image_base64"), "Source preview failed"
    baseline = json.loads((ROOT / "baseline.json").read_text())
    current = json.loads(subprocess.check_output(
        ["docker", "inspect", *baseline], text=True,
    ))
    assert {item["Name"].lstrip("/"): item["Id"] for item in current} == baseline, \
        "An existing production or dental container changed"
    with urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=20) as response:
        assert json.load(response)["status"] == "ok", "Production RAG health failed"
    result = {"commit": args.commit, "public_origin": ORIGIN, "frontend": "Next.js",
              "api_gate": "passed", "password_mfa": "passed", "project_scope": "passed",
              "project_id": workspace["project_id"], "library_records": len(library),
              "source_preview": "passed", "reference_containers": "unchanged",
              "production_health": "passed", "failed_reports_hidden": "passed"}
    if args.chat:
        conversation = api("/conversations", {"title": "Migration qualification " + args.commit[:7]},
                           token=token, project=workspace["project_id"])
        request_id = "migration-" + args.commit[:12] + "-" + str(time.time_ns())
        started = time.monotonic()
        answer = api("/chat", {
            "message": "According to CEC01546478.pdf, what is Parsons Brinckerhoff's role in the utilities diversion programme? Cite the source.",
            "conversation_id": conversation["conversation_id"],
            "doc_ids": ["161298c26281926a"], "request_id": request_id,
        }, token=token, project=workspace["project_id"])
        elapsed = round(time.monotonic() - started, 2)
        chat_check = {"commit": args.commit, "elapsed_seconds": elapsed, **answer,
                      "accepted": False, "conversation_id": conversation["conversation_id"],
                      "project_id": workspace["project_id"]}
        (ROOT / "chat-check.json").write_text(json.dumps(chat_check, indent=2) + "\n")
        citations = answer.get("citations") or []
        assert citations and all(citation["doc_id"] == "161298c26281926a" for citation in citations), \
            "Selected-document citations did not resolve to the source"
        assert "utilit" in answer.get("assistant_text", "").lower(), "Expected source-grounded subject"
        progress = api("/chat/progress/" + request_id, token=token, project=workspace["project_id"])
        assert progress["steps"] and progress["done"], "Real query progress did not complete"
        chat_check.update(accepted=True, progress=progress)
        (ROOT / "chat-check.json").write_text(json.dumps(chat_check, indent=2) + "\n")
        result["real_chat"] = {"seconds": elapsed, "citations": len(citations),
                               "progress_steps": len(progress["steps"]), "selected_source": "passed"}
    if args.chronology:
        started = time.monotonic()
        job = api("/reports/" + args.retry_report + "/retry", {}, token=token,
                  project=workspace["project_id"]) if args.retry_report else api("/chronology/generate", {
            "topic": "Utilities diversion obligations and programme changes in the supplied Edinburgh documents",
            "source_doc_ids": ["161298c26281926a", "0235aed85faa16ec", "8a04f0812c996d8b"],
        }, token=token, project=workspace["project_id"])
        stages = []
        for _ in range(120):
            job = api("/reports/" + job["job_id"], token=token, project=workspace["project_id"])
            stage = job.get("stage") or job["status"]
            if not stages or stage != stages[-1]:
                stages.append(stage)
                print(json.dumps({"chronology_stage": stage, "progress": job.get("progress")}), flush=True)
            check = {"commit": args.commit, "job_id": job["job_id"], "status": job["status"],
                     "seconds": round(time.monotonic() - started, 2), "stages": stages,
                     "error_code": job.get("error_code"), "accepted": False}
            (ROOT / "report-check.json").write_text(json.dumps(check, indent=2) + "\n")
            if job["status"] in ("ready", "failed", "credit_balance_exhausted"):
                break
            time.sleep(2)
        assert job["status"] == "ready", "Chronology qualification failed: " + str(check)
        request = urllib.request.Request(ORIGIN + "/coair-api/reports/" + job["job_id"] + "/document",
            headers={"Authorization": "Bearer " + token, "X-Project-ID": workspace["project_id"]})
        with opener.open(request, timeout=60) as response:
            blob = response.read()
        namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        with zipfile.ZipFile(io.BytesIO(blob)) as archive:
            document = ET.fromstring(archive.read("word/document.xml"))
            footnotes = ET.fromstring(archive.read("word/footnotes.xml"))
        attr = "{" + namespace["w"] + "}id"
        references = {node.attrib[attr] for node in document.findall(".//w:footnoteReference", namespace)}
        records = {node.attrib[attr] for node in footnotes.findall("w:footnote", namespace)}
        assert references and references <= records, "Word footnotes do not resolve"
        assert not document.findall(".//w:tbl", namespace), "Expected the narrative download"
        check.update(accepted=True, footnotes=len(references),
                     entries=len((job.get("result") or {}).get("entries") or []), bytes=len(blob))
        assert check["entries"] > 0, "No sourced events survived"
        (ROOT / "qualification-chronology.docx").write_bytes(blob)
        (ROOT / "report-check.json").write_text(json.dumps(check, indent=2) + "\n")
        result["real_chronology"] = check
    (ROOT / "smoke.json").write_text(json.dumps(result, indent=2) + "\n")
    with (ROOT / "verification_history.jsonl").open("a") as history:
        history.write(json.dumps(result) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
