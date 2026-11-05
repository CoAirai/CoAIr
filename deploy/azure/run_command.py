"""Deploy through Azure OIDC/Run Command without opening runner SSH access.

Uses the existing VM identity/acceptance/release/rollback guard. No registry or
application credentials are placed in the Azure command request. Image packages
must support the target VM's already-qualified anonymous pull policy.
"""
import argparse
import base64
import json
from pathlib import Path
import re
import shlex
import subprocess
import tempfile

from release import image_pair, public_origin, smoke


def script(commit, api, web, origin, guard, archive):
    if image_pair(api, web) != commit:
        raise ValueError("Image commit mismatch")
    public_origin(origin)
    arguments = " ".join(shlex.quote(x) for x in
                         ("--api-image", api, "--web-image", web, "--origin", origin))
    encoded_guard = base64.b64encode(guard).decode()
    encoded_archive = base64.b64encode(archive).decode()
    return f"""#!/bin/bash
set -euo pipefail
umask 077
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
printf '%s' '{encoded_guard}' | base64 -d > "$temporary/release.py"
python3 "$temporary/release.py" {arguments} --check-only
operator=$(stat -c %U /opt/coair-azure)
release=/opt/coair-azure/releases/{commit}
runuser -u "$operator" -- mkdir -p "$release"
printf '%s' '{encoded_archive}' | base64 -d | runuser -u "$operator" -- tar -xzf - --no-same-owner -C "$release"
runuser -u "$operator" -- python3 "$release/deploy/azure/release.py" {arguments}
printf '\\nCOAIR_AZURE_RELEASE={commit}\\n'
"""


def accepted_result(result, commit):
    marker = "COAIR_AZURE_RELEASE=" + commit
    messages = "\n".join(str(row.get("message", "")) for row in result.get("value", []))
    if marker not in messages.splitlines():
        raise RuntimeError("Azure command did not confirm a successful guarded release")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vm-id", required=True)
    parser.add_argument("--api-image", required=True)
    parser.add_argument("--web-image", required=True)
    parser.add_argument("--origin", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"/subscriptions/[0-9a-fA-F-]{36}/resourceGroups/[A-Za-z0-9_.()-]+/providers/Microsoft.Compute/virtualMachines/[A-Za-z0-9_.-]+", args.vm_id):
        raise ValueError("Expected the exact approved Azure VM resource ID")
    commit = image_pair(args.api_image, args.web_image)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if head != commit:
        raise ValueError("Checkout must match the tested images")
    guard = subprocess.check_output(["git", "show", commit + ":deploy/azure/release.py"])
    archive = subprocess.check_output(["git", "archive", "--format=tar.gz", commit,
                                      "deploy/azure/release.py", "deploy/azure/compose.yml"])
    body = script(commit, args.api_image, args.web_image, args.origin, guard, archive)
    with tempfile.TemporaryDirectory(prefix="coair-azure-command-") as folder:
        path = Path(folder) / "release.sh"
        path.write_text(body)
        result = subprocess.run(["az", "vm", "run-command", "invoke", "--ids", args.vm_id,
                                 "--command-id", "RunShellScript", "--scripts", "@" + str(path),
                                 "--only-show-errors", "--output", "json"],
                                check=True, capture_output=True, text=True, timeout=1200)
    accepted_result(json.loads(result.stdout), commit)
    smoke(public_origin(args.origin), commit)
    print(json.dumps({"deployed": True, "commit": commit, "transport": "azure-oidc-run-command"}))


if __name__ == "__main__":
    main()
