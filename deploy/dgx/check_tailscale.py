#!/usr/bin/env python3
"""Run on Spark. Check tailnet HTTPS readiness; configure Serve only on request."""
import argparse
import json
import subprocess
import urllib.request


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=30).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--activate-https", action="store_true")
    args = parser.parse_args()
    state = json.loads(run("tailscale", "status", "--json"))
    if state.get("Self", {}).get("HostName") != "spark-9631":
        raise SystemExit("Run this check on spark-9631, not the operator's Mac.")
    if state.get("BackendState") != "Running":
        raise SystemExit("Spark's Tailscale connection is not running.")
    for path in ("/auth/sign-in", "/coair-api/health"):
        with urllib.request.urlopen("http://127.0.0.1:18081" + path, timeout=15) as response:
            if response.status != 200:
                raise SystemExit("Pilot gateway check failed: " + path)
    print("Local pilot gateway and API respond.")
    if args.activate_https:
        run("tailscale", "serve", "--bg", "--https=443", "http://127.0.0.1:18081")
    config = json.loads(run("tailscale", "serve", "status", "--json"))
    if any(config.get("AllowFunnel", {}).values()):
        raise SystemExit("Public Funnel is enabled; disable it before pilot acceptance.")
    dns = state.get("Self", {}).get("DNSName", "").rstrip(".")
    target = "http://127.0.0.1:18081"
    handlers = config.get("Web", {}).get(dns + ":443", {}).get("Handlers", {})
    if handlers.get("/", {}).get("Proxy") != target:
        raise SystemExit("HTTPS Serve is not configured for the pilot gateway. Tailnet administrator activation may be required.")
    print("Tailnet HTTPS configured: https://" + dns + "/auth/sign-in")
    print("Next: open from an authorized tailnet client and verify login, sources, Word and Excel.")


if __name__ == "__main__":
    main()
