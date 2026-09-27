#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker compose -f compose.yaml ps
# This runs from the appliance itself; only the web gateway is public.
url="${1:-http://127.0.0.1:8080}"
curl --fail --silent --show-error --max-time 15 "$url/coair-api/health"
printf '\n'
curl --fail --silent --show-error --max-time 15 -o /dev/null "$url/auth/sign-in"
echo 'Application API and sign-in page are reachable.'
