# COAir free-tier deployment (no VPS)

Deploy live for **$0/month** using:

| Service | Role | Cost |
| --- | --- | --- |
| **Vercel** | Next.js — login, admin, user portals | Free |
| **Render** | FastAPI backend | Free (may sleep when idle) |
| **Qdrant Cloud** | Vector search | Free (1 GB cluster) |
| **Supabase** | Postgres + Auth | Free tier |
| **Resend** | Transactional email | Free (3k emails/month) |

DNS for `coair.ai` subdomains stays in your **COAir Hostinger account**.

---

## Architecture

```
login.coair.ai  ──┐
admin.coair.ai  ──┼──► Vercel (Next.js)
user.coair.ai   ──┘

api.coair.ai    ──────► Render (Docker — FastAPI)
                              │
                              ├──► Qdrant Cloud
                              └──► Supabase Postgres
```

---

## Part 1 — Qdrant Cloud (you started this)

1. In [Qdrant Cloud](https://cloud.qdrant.io) → create a **Free** cluster.
2. Copy from the cluster dashboard:
   - **Cluster URL** — e.g. `https://xxxxxxxx.us-east-1-0.aws.cloud.qdrant.io`
   - **API Key**
3. Keep these for Render env vars:
   ```env
   VECTOR_STORE_BACKEND=qdrant
   QDRANT_URL=https://YOUR-CLUSTER.cloud.qdrant.io
   QDRANT_API_KEY=your-qdrant-api-key
   QDRANT_COLLECTION=coair
   ```

The collection `coair` is created automatically on first document ingest.

---

## Part 2 — Render (API)

### 1. Create the web service

1. [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service**
2. Connect **GitHub** → repo **CoAirai/CoAIr**
3. Settings:

| Setting | Value |
| --- | --- |
| **Name** | `coair-api` |
| **Root Directory** | `api` |
| **Runtime** | **Docker** |
| **Instance type** | Free (upgrade to Starter/Standard if the app runs out of memory) |
| **Health Check Path** | `/api/health` |

Render sets `PORT` automatically — the Dockerfile entrypoint uses it.

**Alternative:** **New +** → **Blueprint** → select the repo (uses `api/render.yaml`).

### 2. Environment variables (Render → Environment)

Copy values from your local `coair 1/.env` and `COAir/.env.local`. Required:

```env
# LLM
GOOGLE_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-3.6-flash
GEMINI_MODEL_LITE=gemini-2.5-flash-lite
GEMINI_INGESTION_MODEL=gemini-2.5-flash-lite
EMBEDDING_PROVIDER=fastembed

# Auth
JWT_SECRET=long-random-string-at-least-32-chars

# Supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Qdrant Cloud (from Part 1)
VECTOR_STORE_BACKEND=qdrant
QDRANT_URL=https://YOUR-CLUSTER.cloud.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
QDRANT_COLLECTION=coair

# Portal URLs — use production subdomains (Vercel)
COAIR_LOGIN_URL=https://login.coair.ai
COAIR_USER_URL=https://user.coair.ai
COAIR_ADMIN_URL=https://admin.coair.ai
COAIR_APP_URL=https://user.coair.ai

# Email relay goes through Vercel Next.js (set after Part 3)
COAIR_EMAIL_RELAY_URL=https://login.coair.ai/api/email/send
COAIR_EMAIL_RELAY_SECRET=optional-shared-secret

# CORS — all three app subdomains
CORS_ORIGINS=https://login.coair.ai,https://admin.coair.ai,https://user.coair.ai

# Email (API can also send directly if relay fails)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=COAir <noreply@coair.ai>

# Optional
SUPERADMIN_EMAIL=you@coair.ai
FORENSIC_NATIVE_UI_V1=false
```

Click **Save Changes** → Render builds and deploys (first Docker build can take 10–20 minutes).

### 3. Note your Render URL

After deploy, Render gives a URL like:

`https://coair-api.onrender.com`

Test:

```bash
curl https://coair-api.onrender.com/api/health
```

### 4. Custom domain `api.coair.ai`

1. Render → **coair-api** → **Settings** → **Custom Domains** → add `api.coair.ai`
2. Render shows a **CNAME** target (e.g. `coair-api.onrender.com`)
3. In **Hostinger (COAir account)** → **DNS** for `coair.ai`:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `api` | `coair-api.onrender.com` |

Wait for DNS + Render TLS (often 5–30 minutes).

---

## Part 3 — Vercel (frontend)

### 1. Import repo

1. [Vercel → New Project](https://vercel.com/new) → **CoAirai/CoAIr**
2. **Root directory:** repo root (where `package.json` is)
3. **Framework:** Next.js

### 2. Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

COAIR_API_ORIGIN=https://api.coair.ai
NEXT_PUBLIC_COAIR_API_BASE=/coair-api

NEXT_PUBLIC_LOGIN_URL=https://login.coair.ai
NEXT_PUBLIC_ADMIN_URL=https://admin.coair.ai
NEXT_PUBLIC_USER_URL=https://user.coair.ai
NEXT_PUBLIC_APP_URL=https://user.coair.ai

RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=COAir <noreply@coair.ai>
COAIR_EMAIL_RELAY_SECRET=same-as-render-if-set
```

Deploy. Every **git push to `main`** auto-redeploys Vercel and Render.

### 3. Custom domains

Vercel project → **Settings → Domains** → add:

- `login.coair.ai`
- `admin.coair.ai`
- `user.coair.ai`

In Hostinger DNS, add the CNAME records Vercel shows for each subdomain.

### 4. Supabase Auth URLs

**Authentication → URL configuration:**

- **Site URL:** `https://login.coair.ai`
- **Redirect URLs:** `https://login.coair.ai/**`, `https://admin.coair.ai/**`, `https://user.coair.ai/**`

---

## Part 4 — DNS summary (COAir Hostinger account)

| Subdomain | Points to |
| --- | --- |
| `login.coair.ai` | Vercel |
| `admin.coair.ai` | Vercel |
| `user.coair.ai` | Vercel |
| `api.coair.ai` | Render (CNAME) |
| `@` / `www` | Marketing site (unchanged) |

---

## Part 5 — Resend

1. Verify **coair.ai** in [Resend](https://resend.com)
2. Add DNS records Resend gives you in Hostinger
3. `RESEND_API_KEY` on **both** Vercel and Render

---

## Free-tier limits to expect

| Limit | What you'll notice |
| --- | --- |
| Render sleeps after ~15 min idle | First API call after idle takes 30–60s |
| Render Free = 512 MB RAM | Heavy chat/ingestion may OOM — upgrade to **Standard** ($25) or move to VPS later |
| Ephemeral disk on Render | Uploaded files may not survive redeploys — fine for demo; use VPS + persistent disk for production file storage |
| Qdrant Cloud 1 GB | Enough for early demo / small corpora |

---

## Smoke test checklist

- [ ] `curl https://api.coair.ai/api/health` → OK
- [ ] `https://login.coair.ai/auth/sign-in` loads
- [ ] Sign in → redirects to admin or user portal
- [ ] Admin → companies/users load (no CORS errors)
- [ ] Invite user → email arrives (Resend)
- [ ] Chat returns answers (Qdrant + Gemini)

---

## When you get a VPS later

1. Deploy API + Qdrant on VPS (or keep Qdrant Cloud)
2. Change `api.coair.ai` DNS from Render CNAME → VPS A record
3. Keep Vercel for frontend or move to VPS — see [DEPLOY-HOSTINGER.md](./DEPLOY-HOSTINGER.md)

---

## Quick reference — local → production mapping

| Local | Production |
| --- | --- |
| `localhost:3002` | `login.coair.ai` / `admin.coair.ai` / `user.coair.ai` |
| `localhost:8000` | `api.coair.ai` (Render) |
| `http://qdrant:6333` | Qdrant Cloud URL |
| `COAir/.env.local` | Vercel env vars |
| `coair 1/.env` | Render env vars |
