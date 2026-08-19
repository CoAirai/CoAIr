# Authentication, Roles and Scoping

## 1. Getting a token

```http
POST /api/auth/login
Content-Type: application/json

{ "username": "owner", "password": "•••••••" }
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "username": "owner",
    "display_name": "owner",
    "role": "superadmin",
    "features": {},
    "token_limit": 1000000,
    "used_tokens": 0,
    "percent_remaining": 100.0,
    "plan_type": "legacy",
    "credits_total": 0.0,
    "credits_remaining": 0.0,
    "credits_used": 0.0,
    "credit_percent_remaining": 100.0,
    "storage_used_bytes": 0,
    "storage_limit_bytes": 0,
    "storage_percent_used": 0.0
  }
}
```

Wrong credentials → `401 {"detail": "invalid_credentials"}`. Login is the only
public endpoint besides `GET /api/health`.

## 2. Using the token

Send it raw on every request:

```
Authorization: Bearer <access_token>
```

Notes that will save you time:

- This is a **plain bearer header parsed by hand**, not FastAPI's
  `OAuth2PasswordBearer`. The "Authorize" button in `/docs` is therefore not
  wired up — paste the header manually if you use Swagger UI.
- The token is a **JWT (HS256)** with claims `sub` (username), `role`, `iat`,
  `exp`. You may decode it client-side to read the role, but treat the server's
  403s as the real authority.
- **TTL is 7 days** by default (`JWT_TTL_DAYS`). There is **no refresh
  endpoint** and no server-side revocation list.
- `GET /api/auth/me` re-reads the account from the database and returns
  `{"user": {...}}` with the same shape as above. Use it on app boot to
  validate a stored token and refresh quota figures.
- `POST /api/auth/logout` returns `{"ok": true}` and does nothing else — tokens
  are stateless. Log out by discarding the token client-side.

### Failure modes on an authenticated call

| Status | `detail` | Meaning |
|---|---|---|
| 401 | `not_authenticated` | Header missing or malformed |
| 401 | `token_expired` | Past `exp` — re-login |
| 401 | `invalid_token` | Bad signature/format |
| 401 | `unknown_user` | Account no longer exists |
| 403 | `account_disabled` | `is_active = false` |

## 3. Roles

There are two independent axes: a **global** role (what you are on the platform)
and an **organization** role (what you are inside your company). The company
SuperAdmin is an organization role — it is not a global one, so it grants
nothing outside that company.

### Organization roles

An **organization** is a customer company. Users belong to exactly one.

| Org role | Can |
|---|---|
| `owner` | **The company SuperAdmin.** Reaches every project the company owns, creates the company's users, grants and revokes their access to individual projects. |
| `member` | Reaches only the projects it was granted, at the project role it was given. |
| *(none)* | Accounts that predate organizations. They behave exactly as before: their projects are unaffiliated and only their own memberships apply. |

The organization is resolved **from the database on every request, never from
the token**. Tokens live seven days and cannot be revoked, so an `org_id` claim
would keep a demoted SuperAdmin in power for a week. Do not expect org fields in
the JWT — they are not there, deliberately.

`X-Org-ID` lets one of our platform operators act inside a company. It is
**ignored** when sent by anyone else.

### Global roles

Three tiers, stored on the user record and carried in the token.

| Role | Can do |
|---|---|
| `user` | Ordinary product use, limited to the projects they are a member of. |
| `admin` | Everything under `/api/admin/*` and `/api/usage*`; implicitly `owner` of **every** project; sees per-query costs. Manages ordinary users. |
| `superadmin` | Everything an admin can do, **plus** managing operator accounts: creating, promoting, demoting, disabling or deleting an `admin` or `superadmin`. |

Practical consequences for a panel:

- A **customer-facing** admin panel gates on the organization role: call
  `GET /api/org` and branch on `role === 'owner'`. Do not gate it on the global
  role — a company SuperAdmin is a plain global `user`.
- A **platform** console gates on `role === 'admin' || role === 'superadmin'`,
  and gates operator management on `role === 'superadmin'` alone. An `admin`
  calling those gets `403 superadmin_required:<action>` (see
  [ERRORS.md](ERRORS.md)).
- Nobody can change their own role, the last active superadmin cannot be
  demoted, disabled or deleted, and neither can the last owner of a company.
  All enforced server-side; surface them as disabled controls rather than
  letting the user discover the 403.

### Per-user feature flags

Independent of role, each account carries `features: Record<string, boolean>`.
A missing key means off. Known flags today: `correspondence` (email-trace query
mode), `provider_compare`. Endpoints gated on a flag answer
`403 feature_not_available:<name>`.

## 4. Project scoping — the `X-Project-ID` header

Organizations decide *which projects you may select*; they are not a second data
boundary. Documents, vectors, tables, conversations and jobs are isolated **per
project**, and content endpoints resolve their scope from a header:

```
X-Project-ID: <project_id>
```

- Missing on an endpoint that needs it → `428 project_required`.
- Unknown project, or one the caller is not a member of → `404
  project_not_found` (deliberately 404, so project ids cannot be enumerated).
- Project embedding profile ≠ server profile → `409 embedding_profile_unavailable`
  with `project_profile` / `server_profile` in the body.

Within a project, each member holds a project role:

| Project role | Can |
|---|---|
| `viewer` | Read |
| `editor` | Read + upload/ingest (`403 project_editor_required` otherwise) |
| `owner` | Everything, including membership changes (`403 project_owner_required` otherwise) |

A global `admin`/`superadmin` is treated as `owner` of every project; a company
SuperAdmin is treated as `owner` of every project **of its own company**. Each
project record reports how you reached it in `role_source`: `member`, `org` or
`platform`.

**Admin and organization endpoints (`/api/admin/*`, `/api/org/*`, `/api/usage*`)
need only the bearer token — do not send `X-Project-ID` to them.**

## 5. Where accounts live

SQLite, `storage/users.db` — table `users` (with `user_usage`), plus the billing
tables `billing_accounts` / `billing_ledger` / `storage_objects` in the same
file. Projects, project membership, organizations and organization membership
all live in `storage/projects.db`, so one query answers "may this user open this
project". You never touch these directly; they are listed so you know an account
and its billing state are one transaction, not two systems.

Bootstrapping is a server-side action. The first platform operator comes from a
CLI; a company and its SuperAdmin are then created over the API:

```bash
python scripts/create_user.py --username owner --password '•••' --role superadmin
python scripts/create_user.py --username admin --role superadmin --update   # promote

# then, as that operator:
POST /api/admin/users   { "username": "acme-admin", "password": "…" }
POST /api/admin/orgs    { "name": "Acme Ltd", "owner_username": "acme-admin",
                          "default_credits": 1000, "project_limit": 10 }
```

An existing installation is migrated with `scripts/backfill_orgs.py` (dry-run by
default, `--apply`, `--revert <manifest>`).
