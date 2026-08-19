#!/usr/bin/env bash
set -Eeuo pipefail

# Create the host-side directory layout one COAir environment needs, so the
# deploy pipeline can take over from there. Idempotent: safe to re-run against
# an environment that already exists — it creates what is missing and never
# touches existing data, .env.production or secrets.
#
#   sudo scripts/bootstrap_env_dir.sh /opt/mvp-api-dev
#   sudo scripts/bootstrap_env_dir.sh /opt/mvp-api-dev --owner ubuntu
#
# After this, write $APP_DIR/.env.production by hand (mode 600). It is the one
# file the pipeline never ships, because it holds this environment's own
# GOOGLE_API_KEY, JWT_SECRET, QDRANT_API_KEY and QDRANT_COLLECTION. Reusing
# production's values there would defeat the whole separation.

APP_DIR="${1:-}"
OWNER="${OWNER:-$(id -un)}"
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --owner) OWNER="${2:?--owner needs a user}"; shift ;;
    -h|--help) sed -n '3,17p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ -z "$APP_DIR" ]; then
  echo "Usage: $0 <app-dir> [--owner user]" >&2
  exit 2
fi
case "$APP_DIR" in
  /*) ;;
  *) echo "APP_DIR must be an absolute path: $APP_DIR" >&2; exit 2 ;;
esac
case "$APP_DIR" in
  /|/opt|/usr|/var|/home|/etc|/root) echo "Unsafe APP_DIR: $APP_DIR" >&2; exit 2 ;;
esac

# These five are exactly what the deploy asserts before it will switch images,
# and what create_deploy_backup.sh requires to produce a complete archive.
for d in storage data qdrant_storage qdrant_snapshots secrets/google_keys .deploy-backups; do
  mkdir -p "$APP_DIR/$d"
done

chown -R "$OWNER":"$OWNER" "$APP_DIR"
# Per-user provider keys: only the owner may list or read them.
chmod 700 "$APP_DIR/secrets" "$APP_DIR/secrets/google_keys"

# Created empty and never overwritten, exactly like the deploy does it, so the
# operator can drop a key in without a deploy.
if [ ! -f "$APP_DIR/.env.toolkit" ]; then
  install -m 600 -o "$OWNER" -g "$OWNER" /dev/null "$APP_DIR/.env.toolkit"
fi

echo "Bootstrapped $APP_DIR:"
ls -la "$APP_DIR"

if [ ! -f "$APP_DIR/.env.production" ]; then
  cat >&2 <<EOF

NEXT STEP — $APP_DIR/.env.production does not exist yet. The deploy will fail
without it. Create it with mode 600 and values of its OWN (never production's):

  GOOGLE_API_KEY=...
  VECTOR_STORE_BACKEND=qdrant
  QDRANT_URL=http://qdrant:6333
  QDRANT_API_KEY=\$(openssl rand -hex 32)
  QDRANT_COLLECTION=coair_dev
  EMBEDDING_PROVIDER=fastembed
  LOCAL_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
  JWT_SECRET=\$(openssl rand -hex 32)
  JWT_TTL_DAYS=7
  COAIR_USAGE_LIMIT_USD=10

A distinct JWT_SECRET is what makes a session token from one environment
useless against the other; a distinct QDRANT_API_KEY turns a mis-set port into
a 403 instead of a write into the wrong collection.
EOF
fi
