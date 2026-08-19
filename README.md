# COAir

Next.js 15 app for COAir — Super Admin, company workspaces, chat, chronology, and forensic modules.

This repo also includes the **FastAPI backend** in [`api/`](api/) (Docker + Qdrant).

**Production deployment:** see **[docs/DEPLOY.md](docs/DEPLOY.md)** — Vercel (frontend) + VPS (API).

## Monorepo layout

| Path | Deploy to |
| --- | --- |
| `/` (this folder) | Vercel — `login`, `admin`, `user` subdomains |
| `/api` | VPS — `api.coair.ai` (Docker Compose) |

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev -- -p 3002
```

Open [http://localhost:3002](http://localhost:3002).

### Demo accounts

| Role | Email |
| --- | --- |
| Super Admin | `admin@coair.ai` |
| Company Admin (Pro) | `ada@acmebuilders.com` |
| Company Admin (Demo) | `elena@betalabs.io` |
| Member | `ben.carter@acmebuilders.com` |

## Environment variables

Copy from `.env.example`. Leave `RESEND_API_KEY` empty to dry-run emails (UI still works).

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_LOGIN_URL` | Production | Auth portal, e.g. `https://login.coair.ai` |
| `NEXT_PUBLIC_ADMIN_URL` | Production | Super Admin portal, e.g. `https://admin.coair.ai` |
| `NEXT_PUBLIC_USER_URL` | Production | Company admin + member portal, e.g. `https://user.coair.ai` |
| `NEXT_PUBLIC_APP_URL` | Yes | Asset links in emails (alias for `NEXT_PUBLIC_USER_URL`) |
| `RESEND_API_KEY` | No | Set when going live with Resend |
| `RESEND_FROM_EMAIL` | No | Default `COAir <noreply@coair.ai>` |

## Deploy on Vercel

1. Import [CoAirai/CoAIr](https://github.com/CoAirai/CoAIr) in the [Vercel dashboard](https://vercel.com/new).
2. Framework preset: **Next.js** (auto-detected). Root directory: repo root.
3. Add environment variables — full list in **[docs/DEPLOY.md](docs/DEPLOY.md)**.
4. Deploy. Production build command: `npm run build`.

## Subdomain deployment

Marketing site: **coair.ai** (separate). This app uses three subdomains on one Next.js deployment:

| Host | Purpose | Default landing |
| --- | --- | --- |
| `login.coair.ai` | Sign-in, sign-up, password reset | `/auth/sign-in` |
| `admin.coair.ai` | Super Admin | `/admin` |
| `user.coair.ai` | Company admin + members | `/workspace` |

### Production env (Vercel + API)

```env
NEXT_PUBLIC_LOGIN_URL=https://login.coair.ai
NEXT_PUBLIC_ADMIN_URL=https://admin.coair.ai
NEXT_PUBLIC_USER_URL=https://user.coair.ai
NEXT_PUBLIC_APP_URL=https://user.coair.ai
COAIR_LOGIN_URL=https://login.coair.ai
COAIR_USER_URL=https://user.coair.ai
COAIR_ADMIN_URL=https://admin.coair.ai
COAIR_APP_URL=https://user.coair.ai
COAIR_EMAIL_RELAY_URL=https://login.coair.ai/api/email/send
CORS_ORIGINS=https://login.coair.ai,https://admin.coair.ai,https://user.coair.ai
```

### DNS + Vercel

1. Add `login.coair.ai`, `admin.coair.ai`, and `user.coair.ai` as domains on the same Vercel project.
2. Point DNS CNAME records for each subdomain to Vercel.
3. In Supabase → Authentication → URL configuration, add all three subdomains to **Redirect URLs**. Site URL: `https://login.coair.ai`.

After login on `login.coair.ai`, users are sent to `admin.coair.ai` or `user.coair.ai` based on role. Sign-out returns to `login.coair.ai`.

Optional CLI:

```bash
npx vercel
```

## Scripts

```bash
npm run dev      # development
npm run build    # production build
npm run start    # serve production build
npm test         # vitest
```
