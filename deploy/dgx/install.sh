#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
case "$(uname -m)" in aarch64|arm64) ;; *) echo 'This package targets ARM64 DGX Spark.' >&2; exit 1;; esac
docker info >/dev/null
docker compose version
if [ ! -f .env ]; then
  echo 'Run python3 setup.py --model-url http://YOUR-MODEL:8000/v1 --bind DEVICE-IP first.' >&2
  exit 1
fi
if [ -f images.tar ]; then
  sha256sum -c images.tar.sha256
  docker load -i images.tar
fi
compose_args=(-f compose.yaml)
if [ "${1:-}" = '--with-model' ]; then compose_args+=(-f compose.model.yaml); fi
docker compose "${compose_args[@]}" up -d --no-build --wait --wait-timeout 300
echo 'Services started. Create your account once:'
echo 'docker compose -f compose.yaml exec api python scripts/bootstrap_local.py'
echo 'Open http://DEVICE-IP:HTTP_PORT/auth/sign-in or your company DNS address.'
