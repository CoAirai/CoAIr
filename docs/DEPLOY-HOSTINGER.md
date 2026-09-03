# COAir on Hostinger (full stack)

Deploy **everything on Hostinger** — Next.js portals, FastAPI, Qdrant, and nginx — without Vercel.

| Host | Purpose |
| --- | --- |
| `coair.ai` | Marketing (unchanged, can stay wherever it is today) |
| `login.coair.ai` | Auth — `/auth/*` |
| `admin.coair.ai` | Super admin — `/admin/*` |
| `user.coair.ai` | Company admin + members — `/workspace`, `/company` |
| `api.coair.ai` | FastAPI backend |

---

## What you need on Hostinger

Your account today has **Business Web Hosting** (shared). That is enough for WordPress/Node builds, but **not** for Docker + Qdrant.

| Component | Hostinger product | Why |
| --- | --- | --- |
| Next.js + FastAPI + Qdrant + nginx | **VPS (KVM)** — 4 GB RAM, 2 vCPU minimum | Docker, long-running API, vector DB |
| Optional split: Next.js only | Business Web Hosting + VPS for API | More moving parts; only use if you already know shared Node hosting well |

**Recommended:** one **Hostinger VPS** running the full stack. Simplest ops, one bill, one place to SSH.

`coair.ai` is not in your Hostinger domain list yet. You can either:

1. **Point DNS at the VPS** — keep domain registration where it is; add A records for subdomains to the VPS IP, or  
2. **Add `coair.ai` to Hostinger** — transfer domain or update nameservers to Hostinger, then manage DNS in hPanel.

---

## Architecture (single VPS)

```
                    ┌─────────────────────────────────────┐
                    │         Hostinger VPS               │
                    │                                     │
  login.coair.ai ──►│  nginx :443                         │
  admin.coair.ai ──►│    ├─► Next.js :3000 (systemd)      │
  user.coair.ai  ──►│    └─► /coair-api → api.coair.ai    │
                    │                                     │
  api.coair.ai   ──►│  nginx :443 → FastAPI :8000 (Docker)│
                    │              └─► Qdrant (internal)  │
                    └─────────────────────────────────────┘
                                      │
                                      ▼
                            Supabase (hosted Postgres + Auth)
                            Resend (transactional email)
```

---

## Part 1 — Provision the VPS

1. In [Hostinger hPanel](https://hpanel.hostinger.com) → **VPS** → order **KVM 2** (4 GB) or larger, **Ubuntu 22.04**.
2. Note the **public IP** (example: `203.0.113.10`).
3. SSH in:

```bash
ssh root@YOUR_VPS_IP
```

4. Create a deploy user:

```bash
adduser coair
usermod -aG sudo coair
rsync --archive --chown=coair:coair ~/.ssh /home/coair
```

Log in as `coair` for the rest.

---

## Part 2 — Server packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git curl
sudo usermod -aG docker coair
```

Install Node 20 (for Next.js):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should be v20+
```

Log out and back in so the `docker` group applies.

---

## Part 3 — DNS (wherever `coair.ai` is registered)

Add **A records** pointing to your VPS IP:

| Name | Type | Value |
| --- | --- | --- |
| `login` | A | `YOUR_VPS_IP` |
| `admin` | A | `YOUR_VPS_IP` |
| `user` | A | `YOUR_VPS_IP` |
| `api` | A | `YOUR_VPS_IP` |

Leave `coair.ai` / `www` pointing at your marketing site if it lives elsewhere.

Wait for propagation (often 5–30 minutes). Check:

```bash
dig +short login.coair.ai
```

---

## Part 4 — Clone the repo

```bash
sudo mkdir -p /opt/coair
sudo chown coair:coair /opt/coair
cd /opt/coair
git clone https://github.com/CoAirai/CoAIr.git .
```

---

## Part 5 — API (Docker)

```bash
cd /opt/coair/api
cp .env.example .env
nano .env
mkdir -p storage data qdrant_storage qdrant_snapshots secrets/google_keys
```

### Required `api/.env` values

```env
JWT_SECRET=long-random-string-at-least-32-chars
GOOGLE_API_KEY=your-gemini-key

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

COAIR_LOGIN_URL=https://login.coair.ai
COAIR_USER_URL=https://user.coair.ai
COAIR_ADMIN_URL=https://admin.coair.ai
COAIR_APP_URL=https://user.coair.ai
COAIR_EMAIL_RELAY_URL=https://login.coair.ai/api/email/send
COAIR_EMAIL_RELAY_SECRET=generate-a-long-random-string

CORS_ORIGINS=https://login.coair.ai,https://admin.coair.ai,https://user.coair.ai

RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=COAir <noreply@coair.ai>

VECTOR_STORE_BACKEND=qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=strong-local-key
QDRANT_SERVER_API_KEY=same-as-QDRANT_API_KEY

# Amazon S3 (UAE) — put access keys in api/.env, never in git or chat
S3_BUCKET_NAME=coairsuite-aws-s3-uae
AWS_REGION=me-central-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Stripe test mode — webhook optional; Checkout uses session_id confirm
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

Start the stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
curl -s http://127.0.0.1:8000/api/health
```

Optional first-time seed:

```bash
docker compose exec api python scripts/seed_sandbox.py
```

---

## Part 6 — Next.js (frontend)

```bash
cd /opt/coair
cp .env.example .env.production   # or copy from your local .env.local
nano .env.production
npm ci
npm run build
```

### Required `/opt/coair/.env.production`

```env
# Supabase (browser)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# API — public URL (browser hits /coair-api, rewritten to this origin)
COAIR_API_ORIGIN=https://api.coair.ai
NEXT_PUBLIC_COAIR_API_BASE=/coair-api

# Subdomain routing (must match DNS)
NEXT_PUBLIC_LOGIN_URL=https://login.coair.ai
NEXT_PUBLIC_ADMIN_URL=https://admin.coair.ai
NEXT_PUBLIC_USER_URL=https://user.coair.ai
NEXT_PUBLIC_APP_URL=https://user.coair.ai

# Email (Resend) — used by /api/email/send relay
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=COAir <noreply@coair.ai>
COAIR_EMAIL_RELAY_SECRET=same-as-api-if-set

NODE_ENV=production
PORT=3000
```

Install systemd service:

```bash
sudo cp deploy/systemd/coair-nextjs.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now coair-nextjs
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/auth/sign-in
```

---

## Part 7 — nginx + HTTPS

Copy configs from the repo:

```bash
sudo cp /opt/coair/deploy/nginx/coair-api.conf /etc/nginx/sites-available/coair-api
sudo cp /opt/coair/deploy/nginx/coair-app.conf /etc/nginx/sites-available/coair-app
sudo ln -sf /etc/nginx/sites-available/coair-api /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/coair-app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Issue certificates:

```bash
sudo certbot --nginx -d api.coair.ai
sudo certbot --nginx -d login.coair.ai -d admin.coair.ai -d user.coair.ai
```

Verify:

```bash
curl https://api.coair.ai/api/health
curl -I https://login.coair.ai/auth/sign-in
curl -I https://admin.coair.ai/admin
curl -I https://user.coair.ai/workspace
```

---

## Part 8 — Supabase Auth URLs

In **Supabase → Authentication → URL configuration**:

- **Site URL:** `https://login.coair.ai`
- **Redirect URLs:**
  - `https://login.coair.ai/**`
  - `https://admin.coair.ai/**`
  - `https://user.coair.ai/**`

---

## Part 9 — Resend

1. Add and verify **coair.ai** in [Resend](https://resend.com).
2. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in **both** `/opt/coair/.env.production` and `/opt/coair/api/.env`.
3. Invite emails flow: API → `COAIR_EMAIL_RELAY_URL` → Next.js `/api/email/send` → Resend.

---

## Updates (after git push)

```bash
# API
cd /opt/coair && git pull
cd api && docker compose -f docker-compose.prod.yml up -d --build

# Frontend
cd /opt/coair && npm ci && npm run build
sudo systemctl restart coair-nextjs
```

---

## Alternative — Business Web Hosting for Next.js only

If you prefer to keep the **shared Business plan** for the frontend:

1. In hPanel → **Websites** → add **coair.ai** (or connect external domain).
2. Create subdomains `login`, `admin`, `user` with **same public directory** / Node app root.
3. Deploy source via **Node.js** → upload repo archive (no `node_modules`, no `.next`):

   Hostinger builds with `npm run build` and runs `npm start`.

4. Set environment variables in hPanel (same as `.env.production` above).
5. Run the API on a **separate VPS** as in Part 5; point `COAIR_API_ORIGIN=https://api.coair.ai`.

**Limitation:** shared hosting cannot run Docker/Qdrant. You still need a VPS for the API.

This split is harder to operate than one VPS for everything.

---

## Deploy via Hostinger MCP (optional)

From Cursor, these MCP tools can help once `coair.ai` is on your hosting account:

| Tool | Use |
| --- | --- |
| `hosting_createWebsiteV1` | Attach `coair.ai` to your Business order |
| `hosting_createWebsiteSubdomainV1` | Create `login`, `admin`, `user` subdomains |
| `hosting_deployJsApplication` | Upload Next.js **source** archive (shared hosting path) |

VPS setup is done over SSH (Parts 2–7), not through the shared-hosting deploy tools.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Subdomain shows wrong portal | Check `NEXT_PUBLIC_*_URL` env vars; all three must be set and distinct |
| CORS errors | Add all three app URLs to `CORS_ORIGINS` in `api/.env` |
| Invite email not sent | Next.js must be running; `COAIR_EMAIL_RELAY_URL` must be HTTPS and reachable from Docker |
| API 502 | `docker compose ps`; check `curl localhost:8000/api/health` |
| Next.js 502 | `sudo systemctl status coair-nextjs`; check build logs |
| Auth redirect loop | Supabase redirect URLs must include all three subdomains |

---

## Quick checklist

- [ ] Hostinger VPS provisioned (4 GB+)
- [ ] DNS A records for `login`, `admin`, `user`, `api` → VPS IP
- [ ] `api/.env` filled; Docker stack healthy
- [ ] `.env.production` filled; Next.js built and systemd running
- [ ] nginx + certbot for all four hostnames
- [ ] Supabase redirect URLs updated
- [ ] Resend domain verified; keys on frontend + API
- [ ] Test sign-in → admin portal → invite email → user workspace

For Vercel-based deployment instead, see [DEPLOY.md](./DEPLOY.md).
