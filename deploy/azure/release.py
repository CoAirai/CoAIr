"""Release a tested image pair only to the explicitly qualified Azure demo VM.

No infrastructure creation, DB restore, schema downgrade, DNS switch, source
shutdown or pruning. The first restore/qualification is a separate operation.
"""
import argparse
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.request
from urllib.parse import urlsplit

ROOT = Path("/opt/coair-azure")
STATE_ROOT = Path("/srv/coair")
IMAGE = re.compile(r"ghcr\.io/coairai/coair-integration-(api|web):([0-9a-f]{40})")


def image_pair(api, web):
    first, second = IMAGE.fullmatch(api), IMAGE.fullmatch(web)
    if not first or not second or first[1] != "api" or second[1] != "web" or first[2] != second[2]:
        raise ValueError("API/web must be role-correct immutable images from the same commit")
    return first[2]


def public_origin(value):
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or parsed.path or parsed.query or parsed.fragment or
            not re.fullmatch(r"[a-zA-Z0-9.-]+", parsed.netloc) or "." not in parsed.netloc):
        raise ValueError("A plain HTTPS public hostname is required")
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("The public origin must not be a private/loopback address")
    if parsed.hostname.endswith((".invalid", ".localhost")):
        raise ValueError("A configured public hostname is required")
    return value


def read_json_url(url):
    request = urllib.request.Request(url, headers={"Metadata": "true", "Accept": "application/json"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=10) as response:
        return json.load(response)


def target_config(origin):
    if ROOT.resolve() != ROOT or STATE_ROOT.resolve() != STATE_ROOT:
        raise ValueError("Azure deployment/state roots must not be symlinks")
    for name in ("api.env", ".env", "target.json", "release.json"):
        path = ROOT / name
        if path.is_symlink() or not path.is_file():
            raise ValueError("Bootstrap, acceptance and previous release records are required")
    target = json.loads((ROOT / "target.json").read_text())
    if (target.get("environment") != "azure-demo" or target.get("acceptance_complete") is not True
            or target.get("public_origin") != public_origin(origin)):
        raise ValueError("The Azure demo must be qualified for this exact public origin")
    compute = read_json_url("http://169.254.169.254/metadata/instance?api-version=2021-02-01")["compute"]
    for field, expected in (("vmId", "vm_id"), ("subscriptionId", "subscription_id")):
        if not target.get(expected) or str(compute.get(field, "")).lower() != str(target[expected]).lower():
            raise ValueError("This is not the approved Azure VM/subscription")
    for folder in ("data", "storage", "qdrant"):
        path = STATE_ROOT / folder
        if not path.is_dir() or path.resolve() != path:
            raise ValueError("Restore the persistent Azure state before enabling releases")
    return target


def docker_json(command, env):
    result = subprocess.run(command, env=env, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def validate_compose(config, target, api, web):
    services = config["services"]
    if set(services) - {"api", "web", "qdrant", "toolkit"}:
        raise ValueError("Unexpected service in the Azure application release")
    if services["api"]["image"] != api or services["web"]["image"] != web:
        raise ValueError("Compose does not resolve to the requested image pair")
    if services["qdrant"]["image"] != target.get("qdrant_image") or services["qdrant"].get("ports"):
        raise ValueError("Qdrant upgrades/public exposure require separate qualification")
    guard = services["api"]["environment"]
    if (str(guard.get("COAIR_ENFORCE_STATE_OWNER")).lower() != "true" or
            str(guard.get("WEB_CONCURRENCY")) != "1" or
            str(guard.get("COAIR_STATEFUL_API_REPLICAS")) != "1" or
            guard.get("COAIR_WORKER_MODE") != "embedded"):
        raise ValueError("The single API owner guard is required")
    for name, service in services.items():
        for port in service.get("ports", []):
            if port.get("host_ip") not in ("127.0.0.1", "::1"):
                raise ValueError("The single-host demo requires loopback application ports")
        for volume in service.get("volumes", []):
            allowed = {"api": {"/app/data": STATE_ROOT / "data", "/app/storage": STATE_ROOT / "storage",
                               "/run/secrets/google_keys": ROOT / "provider-keys"},
                       "qdrant": {"/qdrant/storage": STATE_ROOT / "qdrant"}}.get(name, {})
            if volume.get("type") != "bind" or allowed.get(volume.get("target")) != Path(volume.get("source", "")).resolve():
                raise ValueError("Unexpected host mount; only restored Azure state is allowed")
            if volume.get("target") == "/run/secrets/google_keys" and volume.get("read_only") is not True:
                raise ValueError("Provider credentials must be read-only")
    api_volumes = services["api"].get("volumes", [])
    api_targets = {volume.get("target") for volume in api_volumes}
    if (len(api_volumes) != len(api_targets) or
            not {"/app/data", "/app/storage"}.issubset(api_targets) or
            len(services["qdrant"].get("volumes", [])) != 1):
        raise ValueError("The persistent API and Qdrant mounts are required")


def smoke(origin, commit):
    payload = read_json_url(origin + "/coair-api/health")
    if payload.get("status") != "ok" or payload.get("commit") != commit:
        raise ValueError("Public API is unready or serves another commit")
    with urllib.request.urlopen(origin + "/auth/sign-in", timeout=30) as response:
        if response.status != 200 or "/_next/" not in response.read().decode():
            raise ValueError("The public Next.js sign-in page is unavailable")


def deploy(api, web, origin):
    commit = image_pair(api, web)
    target = target_config(origin)  # IMDS gate runs before any Docker mutation.
    previous = json.loads((ROOT / "release.json").read_text())
    old_commit = image_pair(previous["API_IMAGE"], previous["WEB_IMAGE"])
    old_compose = ROOT / "releases" / old_commit / "deploy/azure/compose.yml"
    if not old_compose.is_file() or old_compose.resolve() != old_compose:
        raise ValueError("The qualified previous Compose release must be retained")
    if previous.get("public_origin") != origin:
        raise ValueError("Origin changes require a new bootstrap/acceptance")
    with (ROOT / ".deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        env = {**os.environ, "API_IMAGE": api, "WEB_IMAGE": web, "STATE_ROOT": str(STATE_ROOT)}
        command = ["docker", "compose", "--project-name", "coair-azure", "--project-directory", str(ROOT),
                   "--env-file", str(ROOT / ".env"), "--profile", "all-in-one",
                   "-f", str(Path(__file__).with_name("compose.yml"))]
        config = docker_json(command + ["config", "--format", "json"], env)
        validate_compose(config, target, api, web)
        subprocess.run(command + ["pull", "api", "web"], env=env, check=True)
        labels = docker_json(["docker", "image", "inspect", web], env)[0]["Config"].get("Labels") or {}
        if labels.get("com.coair.public-origin") != origin or labels.get("org.opencontainers.image.revision") != commit:
            raise ValueError("The web image was not built for this origin/commit")
        # Qdrant/toolkit are intentionally not recreated on application pushes.
        update = command + ["up", "-d", "--no-deps", "--wait", "--wait-timeout", "240", "api", "web"]
        try:
            subprocess.run(update, env=env, check=True)
            smoke(origin, commit)
        except Exception:
            rollback_env = {**env, "API_IMAGE": previous["API_IMAGE"], "WEB_IMAGE": previous["WEB_IMAGE"]}
            rollback = list(update)
            rollback[rollback.index("-f") + 1] = str(old_compose)
            subprocess.run(rollback, env=rollback_env, check=True)
            smoke(origin, old_commit)
            raise
        record = {"API_IMAGE": api, "WEB_IMAGE": web, "public_origin": origin,
                  "previous": {key: previous[key] for key in ("API_IMAGE", "WEB_IMAGE", "public_origin")}}
        temporary = ROOT / ".release.tmp"
        with temporary.open("w") as handle:
            json.dump(record, handle, indent=2)
        temporary.replace(ROOT / "release.json")
        print(json.dumps({"deployed": True, "commit": commit, "environment": "azure-demo"}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-image", required=True)
    parser.add_argument("--web-image", required=True)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    if args.check_only:
        image_pair(args.api_image, args.web_image)
        target_config(args.origin)
        print(json.dumps({"azure_target_verified": True, "resources_changed": False}))
        return
    deploy(args.api_image, args.web_image, args.origin)


if __name__ == "__main__":
    main()
