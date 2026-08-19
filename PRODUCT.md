# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users:

- **Super Admin (COAir operator)** — manages companies, packages, tokens/economics, billing ops, and access requests.
- **Company Admin** — manages their company team, token shares, billing add-ons, and support tickets.
- **Company Member / Viewer** — works inside project modules (chat, chronology, forensic) with personal token meters.

Situation: construction / project-intelligence teams evaluating or operating COAir in a browser (desktop-first; must work on laptop and mobile).

## Product Purpose

COAir is a project-intelligence workspace: chat with citations against company documents, chronology reports, and forensic programme analysis — sold as packages to companies with token and storage quotas.

Success for this phase: a credible **mock / demo product** on Vercel that customers can click through (auth → SA → company admin → workspace modules) before live Gemini, Stripe, and auth backends are wired.

## Positioning

Three project modules share one company record and session: **Chatbot**, **Chronology**, and **Forensic Delay Analysis**, gated by package and add-ons. Token economics use wholesale (provider) vs retail (sell) rates so COAir can take margin on top-ups and overage while packages stay flat monthly.

## Operating Context

- Super Admin portal at `/admin` (tenants, usage, billing, platform).
- Company Admin at `/company` (team, usage, billing, tickets, settings).
- Workspace hub at `/workspace` then module routes under `/workspace/chat|chronology|forensic`.
- Auth: sign-in / request access / forgot password (sessionStorage mock; Resend scaffold dry-runs without API key).
- Demo accounts: `admin@coair.ai`, `ada@acmebuilders.com`, `elena@betalabs.io`, `ben.carter@acmebuilders.com`.

## Capabilities and Constraints

Confirmed (mock):

- Packages, add-ons, token shares, top-ups with margin pricing, overage rate derived from sell rate.
- Access request → SA approve/deny → owner checkout (dummy payment).
- Shared workspace chat with admin user picker, company docs, personal token consume.
- Chronology reports; forensic intake + tool tree (analysis chat UI still placeholder until customer screenshots).

Integration plan:

- **Chat model** — existing model code will be connected to the current chat UI when available; design/shell stays ready for that plug-in.
- Then other integrations: live metering, Stripe invoices, real auth/storage, forensic analysis chat layout.

Terminology to preserve: COAir, Super Admin, Company Admin, tokens, packages, top-ups, Chronology, Forensic, sell rate / provider rate.

## Brand Commitments

- Name: **COAir**
- Voice: professional project-intelligence product (not consumer social).
- Assets: `public/images/coair-logo.png`, auth hero imagery.
- Visual system: COAir product theme (Satoshi/Inter, `bg-weak-50`, `text-strong-950`, `border-stroke-soft-200`, blue accent).

## Evidence on Hand

- Specs under `docs/superpowers/specs/` (outside app git root in local workspace).
- Live demo via Vercel + local `http://localhost:3002`.
- No customer testimonials or fabricated case studies — do not invent them.

## Product Principles

1. **Operate first** — admin and workspace UI prioritize scanability and task completion over marketing spectacle.
2. **One company record** — modules, tokens, and docs stay company-scoped with clear role boundaries.
3. **Honest mocks** — label demo/dry-run behavior; never pretend live billing or AI until wired.
4. **Margin-aware commerce** — token sell rate is a first-class Super Admin control.
5. **Preserve COAir tokens** — refine within the incumbent design system unless a redesign is requested.

## Accessibility & Inclusion

No formal WCAG mandate recorded yet. Target: keyboard-usable admin nav, visible focus, readable contrast on light/dark themes (`data-theme`).
