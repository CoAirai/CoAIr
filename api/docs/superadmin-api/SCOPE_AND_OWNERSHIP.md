# Admin Panel — Scope and Ownership

Who builds what, and what the backend can and cannot feed today. Read this
before designing screens: some panels you might expect to build have no data
behind them yet, and that is a decision for us to take together rather than
something to discover halfway through.

## The short version

**The admin API exists and is running**, and it now includes the organization
model: a company, its SuperAdmin, its users, and per-project grants.
**What does not exist is the panel** — the product has no admin route and no
user-management screens at all. That is the work.

| | Owner |
|---|---|
| API endpoints, auth, roles, organizations, billing logic, data | **Us** (backend) |
| Admin panel screens, navigation, forms, states, design system | **You** (design + frontend) |
| New endpoints for screens the API cannot feed yet | **Us** — ask, and we build them |

You are not expected to write backend code, and please do not: the API is the
only supported way in, and the accounts/billing tables are not safe to write to
directly.

## What you can build today, with no backend work

Every item below maps to endpoints documented in
[API_REFERENCE.md](API_REFERENCE.md).

| Screen | Backed by |
|---|---|
| Login, session, role-aware navigation | `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/org` |
| **Company overview** — name, plan policy, member/project counts | `GET /api/org` |
| **Company users** — list, create, edit, deactivate, promote to co-SuperAdmin | `/api/org/users*` |
| **Company projects** — every project the company owns, with member counts | `GET /api/org/projects` |
| **Project access** — who can reach a project; grant and revoke | `/api/org/projects/{project_id}/members*` |
| **User list** — role, plan, status, token usage, credits, storage | `GET /api/admin/users` |
| **Create user** — role, quota, feature flags, plan, initial credits, markup, storage limit | `POST /api/admin/users` |
| **Edit user** — profile, role, limits, flags, password, billing settings | `PATCH /api/admin/users/{username}` |
| **Credit top-up / claw-back** with audit reason | `POST /api/admin/users/{username}/credits` |
| **Reset token usage**, **deactivate account** | `POST .../reset-usage`, `DELETE /api/admin/users/{username}` |
| **Spend dashboard** — global budget vs used, token totals | `GET /api/usage` |
| **Billing breakdown** — by project, user, provider, model, date range | `GET /api/admin/usage` |
| **Project list** with per-project stats, usage and cost | `GET /api/projects` |
| Create/rename/archive project, add a member | `POST|PATCH|DELETE /api/projects…`, `POST /api/projects/{project_id}/members` |
| Operational tools — data-table status/reindex/diagnose, jargon dictionary, feedback flywheel, demo cleanup | `/api/admin/data-tables/*`, `/api/admin/jargon/*`, `/api/admin/flywheel/*`, `/api/admin/demo-cleanup/*` |

That is a complete first version of an admin panel without a single new
endpoint.

## What the backend cannot feed yet

Design around these, or ask us and we will build the endpoint. Either is fine —
what is not fine is a screen shipped against data that does not exist.

| Screen you might expect | Status | What it needs |
|---|---|---|
| **Cross-company platform console** (list every company, move projects between them) | Partially there: `/api/admin/orgs*` covers create, appoint, policy, archive and attach-project. There is no bulk move and no per-company billing rollup. | Ask if you need more than the current routes. |
| **Credit / transaction history per user** | Only aggregates are exposed. The itemised ledger exists in the database but has no endpoint. | `GET /api/admin/users/{username}/ledger` |
| **Company-level spend** | Billing is per user; there is no per-company rollup endpoint yet. | An org-scoped variant of `GET /api/admin/usage`. |
| **Credits from inside a company** | Deliberate: only a platform operator adjusts credits, so a company cannot mint its own. | Nothing — this is a policy, not a gap. |
| **Audit trail — who changed what** | Does not exist. Credit adjustments carry a `reason`, but no admin action is recorded with an actor and timestamp. | Backend work, non-trivial. Worth doing before real customers. |
| **Force logout / revoke a session** | Impossible today. Tokens are stateless with no revocation list; deactivating a user blocks the *next* login, not the current token (up to 7 days). | Token revocation, backend work. |
| **Invite by email / password reset** | Neither exists. An admin sets the password directly and passes it on out of band. | Email delivery + token flow. |
| **Search, filter, pagination on the user list** | `GET /api/admin/users` returns every account in one payload, unfiltered. | Fine for tens of users; page it client-side for now and tell us when it hurts. |
| **Per-user activity across projects** | `GET /api/runs` is project-scoped. There is no global "everything this user did" view. | An admin-scoped variant. |

## Gaps we already know about

Not yours to fix; listed so nothing is built on top of them.

- `GET /api/feedback/summary` reads like an admin analytics view but is not
  admin-gated. Do not build an admin feature on it yet.
- `/docs`, `/redoc` and `/openapi.json` are publicly reachable. Use them while
  developing, but do not have the shipped client fetch the schema at runtime.
- **The LLM budget is deployment-wide**, not per company: when it is spent,
  every company gets `402 budget_exceeded`. Render that error as a platform-wide
  condition ("service temporarily unavailable — contact support"), not as
  "your credits ran out", which is the separate `credit_balance_exhausted`.
- **The jargon dictionary is shared** across companies. Treat
  `/api/admin/jargon/*` as a platform tool, not a per-company setting.
- **No per-company spend endpoint.** `GET /api/admin/usage` filters by user or
  project; roll a company up client-side from its project ids, or ask us for a
  proper endpoint.

## How to ask for an endpoint

Send: the screen, the fields it shows, the filters it needs, and what a user
does on it. That is enough for us to design the response shape and turn it
around. Endpoints are cheap when the screen is specific; expensive when the ask
is "an API for the admin panel".
