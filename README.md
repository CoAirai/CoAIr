# COAir Super Admin

Next.js 15 app for COAir Super Admin, company workspaces, chat, chronology, and forensic modules (mock data until live APIs are connected).

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
| `NEXT_PUBLIC_APP_URL` | Yes on Vercel | Public site URL, e.g. `https://your-app.vercel.app` |
| `RESEND_API_KEY` | No | Set when going live with Resend |
| `RESEND_FROM_EMAIL` | No | Default `COAir <noreply@coair.ai>` |

## Deploy on Vercel

1. Import [bolttesting/COAir-Super-Admin](https://github.com/bolttesting/COAir-Super-Admin) in the [Vercel dashboard](https://vercel.com/new).
2. Framework preset: **Next.js** (auto-detected). Root directory: repo root.
3. Add environment variables from the table above. Set `NEXT_PUBLIC_APP_URL` to the Vercel domain (or custom domain).
4. Deploy. Production build command: `npm run build`.

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
