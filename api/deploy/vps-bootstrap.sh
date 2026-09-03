#!/bin/bash
set -euo pipefail
cd /opt/coair-api

python3 <<'PY'
from pathlib import Path
p = Path("/opt/coair-api/.env")
text = p.read_text(encoding="utf-8", errors="replace")
replacements = {
    "COAIR_APP_URL": "https://user.coair.ai",
    "COAIR_LOGIN_URL": "https://login.coair.ai",
    "COAIR_USER_URL": "https://user.coair.ai",
    "COAIR_ADMIN_URL": "https://admin.coair.ai",
    "COAIR_EMAIL_RELAY_URL": "https://login.coair.ai/api/email/send",
    "CORS_ORIGINS": "https://login.coair.ai,https://admin.coair.ai,https://user.coair.ai",
    "VECTOR_STORE_BACKEND": "qdrant",
    "QDRANT_URL": "http://qdrant:6333",
    "APP_MODE": "api",
}
lines = text.splitlines()
seen = set()
out = []
for line in lines:
    if not line or line.lstrip().startswith("#") or "=" not in line:
        out.append(line)
        continue
    key = line.split("=", 1)[0].strip()
    if key in replacements:
        out.append(f"{key}={replacements[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, val in replacements.items():
    if key not in seen:
        out.append(f"{key}={val}")
if not any(l.startswith("QDRANT_API_KEY=") and l.split("=", 1)[1].strip() for l in out):
    out = [l for l in out if not l.startswith("QDRANT_API_KEY=")]
    out.append("QDRANT_API_KEY=coair-vps-qdrant-local-key")
p.write_text("\n".join(out) + "\n", encoding="utf-8")
print("ENV_PATCHED")
for k in [
    "GOOGLE_API_KEY",
    "STRIPE_SECRET_KEY",
    "SUPABASE_URL",
    "JWT_SECRET",
    "S3_BUCKET_NAME",
    "AWS_ACCESS_KEY_ID",
    "COAIR_EMAIL_RELAY_URL",
    "CORS_ORIGINS",
]:
    val = ""
    for l in out:
        if l.startswith(k + "="):
            val = l.split("=", 1)[1].strip()
            break
    print(f"{k}={'set' if val else 'empty'}")
PY

cat > /opt/coair-api/docker-compose.vps.yml <<'YAML'
services:
  api:
    build: .
    container_name: coair-api
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - PORT=8000
      - APP_MODE=api
      - VECTOR_STORE_BACKEND=qdrant
      - QDRANT_URL=http://qdrant:6333
      - EMBEDDING_PROVIDER=fastembed
      - FORENSIC_NATIVE_UI_V1=true
    ports:
      - "127.0.0.1:8000:8000"
    volumes:
      - ./storage:/app/storage
      - ./data:/app/data
      - ./secrets/google_keys:/run/secrets/google_keys:ro
    depends_on:
      - qdrant
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 90s

  qdrant:
    image: qdrant/qdrant:v1.15.4
    container_name: coair-qdrant
    restart: unless-stopped
    environment:
      - QDRANT__SERVICE__API_KEY=${QDRANT_API_KEY:-coair-vps-qdrant-local-key}
    ports:
      - "127.0.0.1:6333:6333"
    volumes:
      - ./qdrant_storage:/qdrant/storage
      - ./qdrant_snapshots:/qdrant/snapshots
YAML

cat > /etc/nginx/sites-available/coair-api <<'NGINX'
server {
    listen 80;
    server_name api.coair.ai;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 100M;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/coair-api /etc/nginx/sites-enabled/coair-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
echo NGINX_OK

# Monthly company token pool reset (1st of month 00:05 UTC).
# Install once on the VPS host:
#   cat > /etc/cron.d/coair-token-pool-reset <<'CRON'
#   SHELL=/bin/bash
#   PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
#   5 0 1 * * root cd /opt/coair-api && docker compose -f docker-compose.vps.yml exec -T api python scripts/reset_org_token_pools.py >> /var/log/coair-token-reset.log 2>&1
#   CRON
#   chmod 644 /etc/cron.d/coair-token-pool-reset
#
# One-time mid-cycle rebalance after shared-pool deploy:
#   docker compose -f docker-compose.vps.yml exec -T api python scripts/rebalance_org_token_pools.py
