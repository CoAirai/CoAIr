# COAir production deployment

This repo is a **monorepo**:

| Path | What | Host |
| --- | --- | --- |
| `/` (repo root) | Next.js app — login, admin, user portals | **Vercel** or **Hostinger VPS** |
| `/api` | FastAPI backend + Qdrant (Docker) | **VPS** (Hostinger, AWS, etc.) |

Marketing site **coair.ai** stays separate.

> **Deploying everything on Hostinger?** See **[DEPLOY-HOSTINGER.md](./DEPLOY-HOSTINGER.md)** for a full single-VPS guide (recommended over Vercel if you want one Hostinger bill).

> **No VPS yet?** See **[DEPLOY-FREE.md](./DEPLOY-FREE.md)** — Vercel + Render + Qdrant Cloud ($0 to start).

---

## Architecture

```
coair.ai                 → marketing (your existing site)

login.coair.ai           → Vercel (Next.js) — /auth/*
admin.coair.ai           → Vercel (Next.js) — /admin/*
user.coair.ai            → Vercel (Next.js) — /workspace, /company/*

api.coair.ai             → VPS (Docker) — FastAPI /api/*
                              ↳ Qdrant (internal, not public)
                              ↳ Supabase Postgres (hosted)
```

Vercel proxies browser calls from `/coair-api/*` to your API using `COAIR_API_ORIGIN`.

---

## Part 1 — Vercel (frontend)

### 1. Import the repo

1. [Vercel → New Project](https://vercel.com/new) → import **CoAirai/CoAIr**
2. **Root directory:** leave as repo root (where `package.json` is)
3. **Framework:** Next.js
4. **Build:** `npm run build`

### 2. Domains

Add to the **same** Vercel project:

- `login.coair.ai`
- `admin.coair.ai`
- `user.coair.ai`

DNS: CNAME each subdomain to Vercel (see Vercel domain settings).

### 3. Vercel environment variables

```env
# Supabase Auth (browser)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# API — public URL of your VPS backend
COAIR_API_ORIGIN=https://api.coair.ai
NEXT_PUBLIC_COAIR_API_BASE=/coair-api

# Subdomain routing
NEXT_PUBLIC_LOGIN_URL=https://login.coair.ai
NEXT_PUBLIC_ADMIN_URL=https://admin.coair.ai
NEXT_PUBLIC_USER_URL=https://user.coair.ai
NEXT_PUBLIC_APP_URL=https://user.coair.ai

# Email (Resend)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=COAir <noreply@coair.ai>

# Optional: lock the Docker → Vercel email relay
COAIR_EMAIL_RELAY_SECRET=generate-a-long-random-string
```

Redeploy after saving env vars.

### 4. Supabase Auth URLs

**Authentication → URL configuration:**

- **Site URL:** `https://login.coair.ai`
- **Redirect URLs:**
  - `https://login.coair.ai/**`
  - `https://admin.coair.ai/**`
  - `https://user.coair.ai/**`

---

## Part 2 — VPS (API on Hostinger or any Linux VPS)

Minimum: **4 GB RAM**, **2 vCPU**, Ubuntu 22.04+.

### 1. Server setup

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git
sudo usermod -aG docker $USER
# log out and back in so docker group applies
```

### 2. Clone and configure

```bash
sudo mkdir -p /opt/coair-api
sudo chown $USER:$USER /opt/coair-api
cd /opt/coair-api
git clone https://github.com/CoAirai/CoAIr.git .
cd api
cp .env.example .env
nano .env   # fill in production values (see checklist below)
```

Create runtime directories:

```bash
mkdir -p storage data qdrant_storage qdrant_snapshots secrets/google_keys
```

### 3. Production `.env` checklist (api/.env)

**Required:**

```env
JWT_SECRET=long-random-string-at-least-32-chars
GOOGLE_API_KEY=your-gemini-key

# Supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Portal URLs (must match Vercel)
COAIR_LOGIN_URL=https://login.coair.ai
COAIR_USER_URL=https://user.coair.ai
COAIR_ADMIN_URL=https://admin.coair.ai
COAIR_APP_URL=https://user.coair.ai
COAIR_EMAIL_RELAY_URL=https://login.coair.ai/api/email/send
COAIR_EMAIL_RELAY_SECRET=same-as-vercel-if-set

# CORS — all three app subdomains
CORS_ORIGINS=https://login.coair.ai,https://admin.coair.ai,https://user.coair.ai

# Email
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=COAir <noreply@coair.ai>

# Qdrant (local on VPS)
VECTOR_STORE_BACKEND=qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=generate-a-strong-local-key
QDRANT_SERVER_API_KEY=same-as-QDRANT_API_KEY-for-prod-compose

# Amazon S3 (UAE) — put access keys in api/.env, never in git or chat
S3_BUCKET_NAME=coairsuite-aws-s3-uae
AWS_REGION=me-central-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Stripe test mode (sk_test_ / pk_test_). Webhook secret optional for now —
# Checkout confirms via success URL session_id. Empty STRIPE_SECRET_KEY = dummy fulfill.
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

**Optional:** `SUPERADMIN_EMAIL=you@coair.ai` for first platform admin.

### 4. Start the stack

From `/opt/coair-api/api`:

```bash
# First deploy — build locally
docker compose -f docker-compose.prod.yml up -d --build

# Or dev-style (simpler, publishes :8000 publicly — use nginx in prod)
docker compose up -d --build
```

Check health:

```bash
curl -s http://127.0.0.1:8000/api/health
docker compose ps
```

Seed sandbox accounts (optional, first time only):

```bash
docker compose exec api python scripts/seed_sandbox.py
```

### 5. Nginx + HTTPS for api.coair.ai

Create `/etc/nginx/sites-available/coair-api`:

```nginx
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
    }
}
```

Enable and get TLS:

```bash
sudo ln -sf /etc/nginx/sites-available/coair-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.coair.ai
```

Verify: `curl https://api.coair.ai/api/health`

### 6. Point Vercel at the API

On Vercel, set:

```env
COAIR_API_ORIGIN=https://api.coair.ai
```

Redeploy Vercel. The Next.js rewrite sends `/coair-api/*` → `https://api.coair.ai/api/*`.

---

## Part 3 — Resend

1. Add and verify domain **coair.ai** in [Resend](https://resend.com)
2. Use sender `COAir <noreply@coair.ai>`
3. Set `RESEND_API_KEY` on **both** Vercel and VPS

Invite emails go through Vercel's `/api/email/send` relay when `COAIR_EMAIL_RELAY_URL` is set on the API.

---

## Part 4 — DNS summary

| Record | Points to |
| --- | --- |
| `login.coair.ai` | Vercel |
| `admin.coair.ai` | Vercel |
| `user.coair.ai` | Vercel |
| `api.coair.ai` | VPS public IP (A record) or Hostinger VPS hostname |

`coair.ai` → your existing marketing site (unchanged).

---

## Updates

**Frontend (Vercel):** auto-deploys on push to `main`.

**API (VPS):**

```bash
cd /opt/coair-api
git pull
cd api
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Login works but admin/team empty | Check `COAIR_API_ORIGIN` on Vercel; curl `/api/health` |
| CORS errors in browser | Add all three subdomains to `CORS_ORIGINS` on API |
| Invite email not sent | Vercel must be live; set `COAIR_EMAIL_RELAY_URL` on API |
| 401 after refresh | Supabase redirect URLs must include all subdomains |
| Chat/search empty | Qdrant running; documents ingested; `GOOGLE_API_KEY` set |

---

## Local development (unchanged)

```powershell
# Terminal 1 — API
cd api
docker compose up -d --build

# Terminal 2 — Next.js
cd ..
npm run dev -- -p 3002
```

Open http://localhost:3002 — API proxied via `/coair-api`.
