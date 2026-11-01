#!/usr/bin/env bash
# Run on the DGX. Source-bearing development image is retained for rollback.
set -euo pipefail
cd "$(dirname "$0")/.."
base=(docker compose -f compose.yaml)
protected=(docker compose -f compose.yaml -f compose.protected.yaml)
case "${1:-status}" in
  status)
    "${protected[@]}" ps
    "${protected[@]}" exec -T api python -c 'import json, coair_protected; m=coair_protected.activate(); print(json.dumps({k:m[k] for k in ("release","protection","encrypted_modules","compiled_modules","encrypted_resources")}))'
    ;;
  enable)
    test -s protection-secrets/device.key
    test -s protection-secrets/license.json
    "${protected[@]}" up -d --no-deps --no-build --wait --wait-timeout 180 api
    ;;
  rollback)
    "${base[@]}" up -d --no-deps --no-build --wait --wait-timeout 180 api
    ;;
  *) echo 'Usage: manage.sh status|enable|rollback' >&2; exit 2 ;;
esac
