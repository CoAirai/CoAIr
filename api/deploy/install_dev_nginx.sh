#!/usr/bin/env bash
#
# Publishes the COAir development stack on port 8090. Run once, as root, on the
# server:
#
#   sudo htpasswd -c /etc/nginx/.htpasswd-coair-dev devuser
#   sudo deploy/install_dev_nginx.sh deploy/nginx
#
# Unlike the toolkit installer this adds a whole server block of its own, so it
# never edits production's site file. Re-running refreshes the block; a config
# that fails `nginx -t` is rolled back to exactly what was there before.
#
# Remember the Lightsail firewall: TCP 8090 must be opened in the AWS console
# (Networking → IPv4 Firewall), and in ufw as well if ufw is active.
set -euo pipefail

SOURCE_DIR="${1:?source directory is required}"
TARGET="${2:-/etc/nginx/sites-available/coair-dev}"
LINK="/etc/nginx/sites-enabled/$(basename "$TARGET")"
HTPASSWD="/etc/nginx/.htpasswd-coair-dev"
BACKUP="${TARGET}.coair-dev-backup"

test -f "$SOURCE_DIR/coair-dev.conf"

if [ ! -f "$HTPASSWD" ]; then
  echo "Missing $HTPASSWD — create it first:" >&2
  echo "  sudo htpasswd -c $HTPASSWD devuser" >&2
  echo "(apt-get install -y apache2-utils if htpasswd is not present)" >&2
  exit 1
fi

had_previous=0
if [ -f "$TARGET" ]; then
  cp "$TARGET" "$BACKUP"
  had_previous=1
fi

install -m 0644 "$SOURCE_DIR/coair-dev.conf" "$TARGET"
ln -sfn "$TARGET" "$LINK"

if ! nginx -t; then
  echo "nginx config test failed — rolling back." >&2
  if [ "$had_previous" -eq 1 ]; then
    cp "$BACKUP" "$TARGET"
  else
    rm -f "$LINK" "$TARGET"
  fi
  nginx -t
  exit 1
fi

systemctl reload nginx
echo "COAir dev is served on port 8090 → 127.0.0.1:8100 (basic auth)."
