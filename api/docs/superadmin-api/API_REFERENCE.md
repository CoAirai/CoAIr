# COAir API Reference

Base path: **`/api`** on the API host. Every path below is written in full.

**Auth column:** `PUB` none · `USER` bearer token · `USER+PROJ` bearer token **and**
`X-Project-ID` · `ADMIN` role `admin` or `superadmin` (our platform operators) ·
`SUPER` role `superadmin` · `OO` organization owner (a customer's SuperAdmin).

Sections 1–6 are the admin surface, documented field by field. Section 7 covers
the rest of the product — every endpoint, with its request body.

**Identifiers, because three of them look alike.** `project_id` (16 hex chars)
scopes everything. `file_id` identifies an uploaded file and is what you delete
or re-index. `doc_id` identifies an *ingested document* — `md5(file path)[:16]`
— and is what citations, the viewer and knowledge collections use. They are not
interchangeable, and a file re-ingested from a different path gets a new
`doc_id`. `conv_id`, `job_id`, `run_id`, `workspace_id` and `org_id` are opaque
strings; never construct one yourself.

---

## 1. Health and auth

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | PUB | Readiness. `503` when a runtime dependency is down. Use for uptime checks. |
| POST | `/api/auth/login` | PUB | Username/password → bearer token + user object. |
| GET | `/api/auth/me` | USER | Re-read the current account (role, features, quota, credits, storage). |
| POST | `/api/auth/logout` | PUB | `{"ok": true}`. No server state — discard the token client-side. |

Shapes: see [AUTH_AND_ROLES.md](AUTH_AND_ROLES.md).

---

## 2. Organizations — the company SuperAdmin surface

An **organization** is a customer company. Its `owner` is the company's
SuperAdmin: it reaches every project the company owns, creates the company's
user accounts, and grants those users access to individual projects. A `member`
reaches only the projects it was granted.

`OO` = organization owner. These routes need only the bearer token — no
`X-Project-ID`. One of our platform operators can act inside a company by
sending `X-Org-ID`; that header is ignored for everyone else.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/org` | any member | The caller's company: name, own role, policy, counts. |
| GET | `/api/org/users` | OO | Every account in the company. |
| POST | `/api/org/users` | OO | Create an account inside the company. `201`. |
| PATCH | `/api/org/users/{username}` | OO | Name, password, active flag, feature flags, org role. |
| DELETE | `/api/org/users/{username}` | OO | Deactivate. `204`. |
| GET | `/api/org/usage` | OO | What the company has spent, rolled up from its own projects. |
| GET | `/api/org/projects` | OO | Every project of the company, with member counts. |
| GET | `/api/org/projects/{project_id}/members` | OO | Who can reach one project. |
| PUT | `/api/org/projects/{project_id}/members/{username}` | OO | Grant access: body `{"role":"owner\|editor\|viewer"}`. |
| DELETE | `/api/org/projects/{project_id}/members/{username}` | OO | Revoke access. `204`. |

### GET /api/org

```json
{
  "org": { "org_id": "…", "name": "Acme Ltd", "slug": "acme-ltd",
           "created_at": "…", "archived_at": null },
  "role": "owner",
  "policy": { "default_plan_type": "demo", "default_credits": 250.0,
              "default_token_limit": 500000, "default_storage_bytes": 30000000000,
              "project_limit": 0, "allow_member_projects": false },
  "counts": { "members": 2, "owners": 1, "projects": 1, "archived_projects": 0 }
}
```

### POST /api/org/users

```json
{ "username": "surveyor", "password": "…", "display_name": "Site Surveyor",
  "features": { "correspondence": true } }
```

Deliberately **not** in this contract, because they are not a company's to set:

- **`role`** — accounts created here are always plain `user` accounts. A company
  SuperAdmin cannot mint admins.
- **`plan_type`, `initial_credits`, `token_limit`, `storage_limit_bytes`** —
  taken from the company's policy, which only we can change.
- **`corpus`** in `features` — it selects a legacy bulk document set that
  predates projects. Unknown feature keys are dropped silently; only
  `correspondence` and `provider_compare` are assignable.

The response is a deliberate subset of the platform user object: no
`markup_percent`, `model_policy`, `dedicated_provider_key` or provider cost.
It adds `org_role` and `project_count`.

### GET /api/org/usage

Optional `date_from` / `date_to` (ISO dates, inclusive).

```jsonc
{
  "groups": [{ "project_id": "…", "username": "engineer", "provider": "gemini",
               "model": "gemini-3.6-flash", "task_type": "chat",
               "calls": 128, "prompt_tokens": 940210, "completion_tokens": 61022,
               "reasoning_tokens": 0, "cached_tokens": 0,
               "debited_credit": 41.2 }],
  "totals": { "calls": 128, "prompt_tokens": 940210,
              "completion_tokens": 61022, "credits_used": 41.2 }
}
```

Rolled up by **project**, not by member: a project's company is fixed, whereas
summing over members would rewrite history when someone moves company. Credits
only — `estimated_provider_cost_usd` and the uncovered-cost figures are our cost
basis and are deliberately absent. A company with no projects gets zeroed
totals, not a 404.

### Guard rails

| Attempt | Answer |
|---|---|
| Reach a user or project of another company | `404` — never `403`, so names cannot be probed |
| Grant a project to a user outside the company | `422 user_not_in_organization` |
| Same via the older `POST /api/projects/{project_id}/members` | `422 cross_org_membership` (the check lives in the store, so no route can bypass it) |
| Change your own org role | `403 cannot_change_own_role` |
| Remove the last owner | `409 last_org_owner` |
| Create a project beyond the company's limit | `409 org_project_limit_reached` |
| Member creating a project when `allow_member_projects` is false | `403 org_owner_required` |
| Any `/api/admin/*` route | `403 admin_required` |

### Platform routes (ours, not a customer's)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/orgs` | ADMIN | Every company with counts. |
| POST | `/api/admin/orgs` | ADMIN | Create a company and optionally appoint its SuperAdmin. `201`. Body below. |
| GET | `/api/admin/orgs/{org_id}` | ADMIN | One company with members and projects. |
| PATCH | `/api/admin/orgs/{org_id}` | ADMIN | Rename, change policy, or `{"archived": true}`. |
| POST | `/api/admin/orgs/{org_id}/members` | ADMIN | Appoint an owner or add a member. `201`. |
| DELETE | `/api/admin/orgs/{org_id}/members/{username}` | ADMIN | Remove from the company. `204`. |
| POST | `/api/admin/orgs/{org_id}/projects/{project_id}` | ADMIN | Attach an existing project. `409 members_outside_organization` (with the offending usernames) unless `?force=true`. |

`POST /api/admin/orgs` body — everything except `name` is optional and becomes
the company's policy, i.e. the defaults its SuperAdmin provisions users on:

```json
{ "name": "Acme Ltd", "owner_username": "acme-admin",
  "default_plan_type": "demo", "default_credits": 1000,
  "default_token_limit": 2000000, "default_storage_bytes": 30000000000,
  "project_limit": 10, "allow_member_projects": false }
```

`PATCH /api/admin/orgs/{org_id}` takes the same fields, all optional, plus
`{"archived": true}`. `POST .../members` takes `{"username": "…", "role":
"owner"|"member"}`. `GET /api/admin/orgs` accepts `?include_archived=true`.

A user belongs to **exactly one** company. Adding one who is already placed
answers `409 user already belongs to an organization`.

---

## 3. User management — `/api/admin/users`

The core of an admin panel. All of these are `ADMIN`, except where the target is
an operator account (`admin`/`superadmin`), which requires `SUPER`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/users` | ADMIN | Accounts, filtered and paged. Query: `q` (username or display name), `org_id`, `limit` (1–500, default 100), `offset`, `include_inactive` (default true). |
| GET | `/api/admin/users/{username}/ledger` | ADMIN | Every charge and adjustment on one account. Query: `limit`, `offset`. |
| POST | `/api/admin/users` | ADMIN (SUPER if `role` is admin/superadmin) | Create an account. `201`. |
| PATCH | `/api/admin/users/{username}` | ADMIN (SUPER if target is, or becomes, an operator) | Update profile, role, limits, flags, password, billing. |
| POST | `/api/admin/users/{username}/credits` | ADMIN | Signed credit adjustment with an audit reason. |
| POST | `/api/admin/users/{username}/reset-usage` | ADMIN | Zero the token counters (not the credits). |
| DELETE | `/api/admin/users/{username}` | ADMIN (SUPER if target is an operator) | **Soft** delete — sets `is_active = false`. `204`. |

### GET /api/admin/users

```json
{ "users": [ { /* user object, see below */ } ],
  "total": 42, "limit": 100, "offset": 0 }
```

`total` is the count **after** filtering, so a table can page without asking
twice. Filters combine: `?org_id=…&q=admin&limit=25` is one company's admins,
first page.

### GET /api/admin/users/{username}/ledger

Why a balance is what it is. The rows are append-only and every charge, top-up
and claw-back lands here.

```jsonc
{
  "entries": [{
    "event_id": "…", "event_type": "adjustment", "created_at": "…",
    "project_id": null, "run_id": null, "job_id": null,
    "task_type": "", "provider": "", "model": "",
    "prompt_tokens": 0, "completion_tokens": 0,
    "reasoning_tokens": 0, "cached_tokens": 0,
    "retail_credit": 250.0, "debited_credit": 0.0, "uncovered_credit": 0.0,
    "note": "Pilot top-up"          // the `reason` from the credits endpoint
  }],
  "total": 17
}
```

Newest first. `404 user_not_found` for an unknown account. This is a platform
route: credits stay our action, so a company SuperAdmin gets `403` here and uses
`GET /api/org/usage` instead.

### The user object

Returned by list, create and patch. Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | number | Row id. |
| `username` | string | Immutable identifier and login. |
| `display_name` | string | Falls back to `username`. |
| `role` | `"user" \| "admin" \| "superadmin"` | |
| `token_limit` | number | Hard cap, prompt+completion combined. `0` = unlimited. |
| `features` | `Record<string, boolean>` | Per-user feature flags. |
| `is_active` | boolean | `false` after a soft delete → login is refused. |
| `created_at`, `updated_at` | ISO 8601 string | UTC, no timezone suffix. |
| `used_tokens`, `percent_remaining`, `total_calls` | number | Token counters. |
| `plan_type` | `"demo" \| "legacy"` | `demo` = credit-metered. `legacy` = unmetered (all operator accounts). |
| `credits_total`, `credits_remaining`, `credits_used`, `credit_percent_remaining` | number | Credit balance. |
| `storage_used_bytes`, `storage_limit_bytes`, `storage_percent_used` | number | `storage_limit_bytes: 0` = unlimited. |
| `markup_percent` | number | Retail markup applied over provider cost. |
| `model_policy` | string | Named model-selection policy, e.g. `demo-tiered-quality-v2`. |
| `dedicated_provider_key` | boolean | Whether a dedicated AI credential is bound. The key itself is never returned. |

Example (a freshly created demo user):

```json
{
  "id": 2,
  "username": "acme",
  "display_name": "Acme Ltd",
  "role": "user",
  "token_limit": 1000000,
  "features": { "correspondence": true },
  "is_active": true,
  "created_at": "2026-08-12T13:50:07.794325",
  "updated_at": "2026-08-12T13:50:07.794325",
  "used_tokens": 0,
  "percent_remaining": 100.0,
  "total_calls": 0,
  "plan_type": "demo",
  "credits_total": 1000.0,
  "credits_remaining": 1000.0,
  "credits_used": 0.0,
  "credit_percent_remaining": 100.0,
  "storage_used_bytes": 0,
  "storage_limit_bytes": 30000000000,
  "storage_percent_used": 0.0,
  "markup_percent": 30.0,
  "model_policy": "demo-tiered-quality-v2",
  "dedicated_provider_key": false
}
```

### POST /api/admin/users

| Field | Type | Default | Notes |
|---|---|---|---|
| `username` | string | — | Required, 3–64 chars. `400` if taken. |
| `password` | string | — | Required, ≥ 6 chars. Stored bcrypt-hashed. |
| `display_name` | string \| null | `null` | |
| `role` | string | `"user"` | `admin`/`superadmin` require a superadmin caller. |
| `token_limit` | number | `1000000` | |
| `features` | object | `{}` | |
| `plan_type` | `"demo" \| "legacy"` | `"demo"` | Forced to `legacy` for operator accounts. |
| `initial_credits` | number ≥ 0 | `1000` | Forced to `0` for operator accounts. |
| `markup_percent` | number 0–1000 | `30` | |
| `storage_limit_bytes` | number ≥ 0 | `30000000000` | Forced to `0` (unlimited) for operator accounts. |
| `model_policy` | string | `"demo-tiered-quality-v2"` | Cleared for operator accounts. |
| `provider_key_ref` | string ≤ 64 | `""` | **Alias** of a server-mounted key. Never send key material. |

Returns `201` + the user object.

### PATCH /api/admin/users/{username}

Every field optional; omit what you are not changing. `null` is treated as "not
supplied", so you cannot null a field out — send an explicit value.

`display_name`, `role`, `token_limit`, `features`, `is_active`, `password`,
`plan_type`, `markup_percent`, `storage_limit_bytes`, `model_policy`,
`provider_key_ref`.

- `features` **replaces** the whole map — send the full set, not a delta.
- `password` re-hashes; there is no "must change on next login" flag.
- `role` must be one of the three known roles, otherwise `400 invalid role`.
- Guard rails: `403 superadmin_required:modify_operator` /
  `:promote_operator`, `403 cannot_change_own_role`, `409 last_superadmin`.

Returns `200` + the user object. `404 user_not_found` if unknown.

### POST /api/admin/users/{username}/credits

```json
{ "credits": 250, "reason": "Top-up for pilot", "idempotency_key": "topup-2026-08-01" }
```

- `credits` is **signed** — negative claws credit back.
- `reason` is required (3–500 chars) and is written to the ledger. Treat it as
  an audit field and put something meaningful in it.
- `idempotency_key` (≤ 120 chars, optional but recommended): replaying the same
  key is a no-op, so a retried request cannot double-credit an account.

Returns the account's balance summary:

```json
{
  "plan_type": "demo",
  "credits_total": 1250.0,
  "credits_remaining": 1250.0,
  "credits_used": 0.0,
  "credit_percent_remaining": 100.0,
  "storage_used_bytes": 0,
  "storage_limit_bytes": 30000000000,
  "storage_percent_used": 0.0,
  "markup_percent": 30.0,
  "model_policy": "demo-tiered-quality-v2",
  "dedicated_provider_key": false
}
```

`404 user_not_found`, or `422` if the adjustment is rejected (e.g. a reused
idempotency key with different values).

### POST /api/admin/users/{username}/reset-usage

No body. Zeroes the **token** counters only — credits and storage are untouched.

```json
{ "username": "acme", "used_tokens": 0, "token_limit": 1000000,
  "percent_remaining": 100.0, "prompt_tokens": 0, "completion_tokens": 0, "total_calls": 0 }
```

### DELETE /api/admin/users/{username}

Soft delete → `204`, `is_active` becomes `false`, the account can no longer log
in and its data is retained. Refusals: `403 cannot_delete_self`,
`403 superadmin_required:delete_operator`, `409 last_superadmin`.

---

## 4. Usage and billing

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/usage` | ADMIN | Global LLM spend against the configured budget. |
| POST | `/api/usage/reset` | ADMIN | Reset that global counter. |
| GET | `/api/admin/usage` | ADMIN | Per-project / per-user billing breakdown. |

`GET /api/usage`:

```json
{ "used_usd": 0.17812, "limit_usd": 100.0, "remaining_usd": 99.82188,
  "remaining_pct": 0.9982, "over_budget": false,
  "prompt_tokens": 961779, "completion_tokens": 63970,
  "total_tokens": 1025749, "total_calls": 1570 }
```

`remaining_pct` is a **fraction** (0.9982), not a percentage — multiply by 100
before rendering.

`GET /api/admin/usage` — optional query filters `username`, `project_id`,
`date_from`, `date_to` (ISO dates, inclusive). Returns `{"groups": [...]}`,
grouped by project × user × provider × model × task type × pricing version:

| Field | Meaning |
|---|---|
| `project_id`, `username`, `provider`, `model`, `task_type`, `pricing_version`, `usage_source` | Grouping keys. |
| `calls` | Number of LLM calls. |
| `prompt_tokens`, `completion_tokens`, `reasoning_tokens`, `cached_tokens` | Token totals. |
| `estimated_provider_cost_usd` | What the provider charged us. |
| `retail_credit` | Credits the usage was worth at the account's markup. |
| `debited_credit` | Credits actually taken from the balance. |
| `uncovered_credit`, `uncovered_provider_cost_usd` | Usage served but not covered by a balance — the revenue leak, if any. |
| `markup_percent` | Markup in effect for that group. |

An empty result is `{"groups": []}`, not `404`.

---

## 5. Operational admin

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/data-tables/status` | ADMIN | Per-file registration state of Excel/CSV data tables. |
| POST | `/api/admin/data-tables/reindex` | ADMIN | Re-ingest selected or unregistered data files (runs in background). Body: `{"file_ids": ["…"], "dry_run": true}`. |
| POST | `/api/admin/data-tables/diagnose` | ADMIN | Per-sheet schema-match breakdown for one file. Body: `{"file_id": "…"}`. |
| POST | `/api/admin/demo-cleanup/prepare` | ADMIN | Plan a demo-data wipe; returns a confirmation token. Body: `{"project_id": "…", "documents": true, "emails": true, "excel": false}` — pick what to wipe. |
| POST | `/api/admin/demo-cleanup/execute` | ADMIN | Execute it with `{"token": "…", "confirmation": "…"}` from the prepare step. Destructive — always two-step. |
| GET | `/api/admin/flywheel/status` | ADMIN | Feedback, golden-set and learned-routing snapshot. |
| POST | `/api/admin/flywheel/apply` | ADMIN | Apply captured feedback improvements. |
| GET | `/api/admin/jargon` | ADMIN | Abbreviation → expansion dictionary. |
| POST | `/api/admin/jargon` | ADMIN | Add a term: `{"abbreviation": "EOT", "full_form": "Extension of Time", "concept_group": "…"}`. |
| DELETE | `/api/admin/jargon/{abbreviation}` | ADMIN | Remove a term. |
| POST | `/api/admin/jargon/reload` | ADMIN | Reload the dictionary from disk. |
| GET | `/api/admin/projects/{project_id}/jargon-candidates` | ADMIN | Terms the ingest pipeline proposed for one project, awaiting a decision. Query `status`. |
| POST | `/api/admin/projects/{project_id}/jargon-candidates/{candidate_id}` | ADMIN | Accept or reject one proposal. |
| GET | `/api/admin/reports/{job_id}/diagnostics` | ADMIN | Cross-project diagnostics + cost profile for one report job. |

These return loosely-typed dictionaries; check `openapi.json` and the live
responses before binding a UI tightly to them.

---

## 6. Projects

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/projects` | USER | Projects visible to the caller: granted memberships, plus **every project of the caller's company** when they are its owner. All of them for a platform admin. Includes per-project stats and usage. |
| POST | `/api/projects` | USER | Create (`name`, `embedding_profile`). `201`. The company is stamped from the actor, never the body; `project_limit` and `allow_member_projects` apply. |
| PATCH | `/api/projects/{project_id}` | project owner | Rename. |
| POST | `/api/projects/{project_id}/members` | project owner | Add a member: `{username, role}` with role `owner`/`editor`/`viewer`. |
| DELETE | `/api/projects/{project_id}` | project owner | Archive. |

`GET /api/projects` in full — this is the record every project screen renders:

```jsonc
{
  "projects": [{
    "project_id": "…", "name": "Tower A", "slug": "tower-a",
    "embedding_profile": "local-bge-v1",
    "created_by": "acme-admin", "created_at": "…", "updated_at": "…",
    "archived_at": null,
    "org_id": "…",            // the owning company, null if unaffiliated
    "role": "owner",          // your project role
    "role_source": "org",     // "member" | "org" | "platform" — how you got it
    "stats": {
      "files": { "document": 12, "email": 40, "data": 3, "programme": 1 },
      "total_files": 56,
      "queued": 0, "processing": 0, "ready": 56, "failed": 0,
      "eta_seconds": null,
      "calibration_size": 20, "calibration_complete": true,
      "report_ready": true,   // enough ingested to run a report
      "vector": { "status": "ready", "point_count": 74213,
                  "embedding_profile": "local-bge-v1", "last_error": null }
    },
    "usage": {
      "calls": 128, "prompt_tokens": 940210, "completion_tokens": 61022,
      "credits_used": 41.2,
      // the four below only for a platform admin, or the company's own owner
      "retail_credits": 53.6, "estimated_provider_cost_usd": 0.412,
      "uncovered_provider_cost_usd": 0.0, "uncovered_credits": 0.0
    }
  }],
  "account_usage": { /* the caller's own billing summary */ }
}
```

An ordinary member sees only its own consumption in `usage`; the company's owner
and our operators see the whole project's.

Each project record carries `org_id` and `role_source` — `member` (an explicit
`project_members` row), `org` (company-wide reach as the organization's owner)
or `platform` (one of our operators). Members can also be listed and revoked
directly:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/projects/{project_id}/members` | project owner | Who can reach it. |
| DELETE | `/api/projects/{project_id}/members/{username}` | project owner | Revoke. `204`; `409 last_project_owner` for the final owner. |

---

## 7. The rest of the product surface

Every remaining endpoint, in full. `USER+PROJ` unless the row says otherwise.
You will not need most of these for an admin panel, but nothing is hidden: this
is the complete API.

### Chat

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/chat` | USER+PROJ | The main RAG query. Body: `message`, `conversation_id`, `doc_ids`, `email_ids`, `mode`, `request_id`. A single blocking POST — no SSE, no WebSocket — and it can legitimately take 60–120 s. |
| GET | `/api/chat/progress/{request_id}` | USER+PROJ | Poll the live activity steps of an in-flight query, using the `request_id` you sent. |
| POST | `/api/chat/document` | USER+PROJ | Render one answer as a .docx. Pure formatter — it echoes the payload you post. |

Bodies:

```jsonc
// POST /api/chat   (* = required)
{ "message": "…", "conversation_id": "…",   // *
  "doc_ids": ["…"],      // scope the answer to specific documents
  "email_ids": ["…"],    // correspondence mode only
  "mode": "chat" | "correspondence" | "document_analysis",
  "provider": "gemini",  // leave unset unless you know why
  "request_id": "…" }    // your own id, then poll /chat/progress/{request_id}

// POST /api/chat/document — echoes back what you post, as a .docx
{ "question": "…", "answer": "…", "citations": [{"doc_name": "…", "anchor": "…"}],
  "sql": "…", "table_columns": ["…"], "table_rows": [["…"]], "total_rows": 0 }
```

`mode: "correspondence"` needs the `correspondence` feature flag on the account,
otherwise `403 feature_not_available:correspondence`.

### Conversations

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/conversations` | USER+PROJ | List. Query `archived` to include archived ones. |
| POST | `/api/conversations` | USER+PROJ | Create. |
| GET | `/api/conversations/{conv_id}` | USER+PROJ | One conversation with its messages. |
| PATCH | `/api/conversations/{conv_id}` | USER+PROJ | Rename. |
| DELETE | `/api/conversations/{conv_id}` | USER+PROJ | Delete. |
| PATCH | `/api/conversations/{conv_id}/pin` | USER+PROJ | Pin / unpin. |
| PATCH | `/api/conversations/{conv_id}/archive` | USER+PROJ | Archive / restore. |
| GET | `/api/conversations/{conv_id}/documents` | USER+PROJ | Documents attached to the conversation. |
| POST | `/api/conversations/{conv_id}/documents` | USER+PROJ | Attach documents. |
| DELETE | `/api/conversations/{conv_id}/documents/{doc_id}` | USER+PROJ | Detach one. |

Bodies: create and rename take `{"title": "…"}`; pin takes `{"pinned": true}`;
archive takes `{"archived": true}`; adding documents takes
`{"doc_ids": ["…"]}`. `GET /api/conversations` accepts `?archived=true`.

Conversations are private per user **and** per project — there is no shared or
team conversation.

### Files, upload and ingestion

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/upload` | project **editor** | Multipart upload; enqueues ingestion. `413 storage_quota_exceeded` when the account is full. |
| GET | `/api/files` | USER+PROJ | The project's files. |
| DELETE | `/api/files/{file_id}` | USER+PROJ | Delete a file and everything derived from it. |
| POST | `/api/files/{file_id}/reindex` | USER+PROJ | Delete and re-ingest one file. |
| POST | `/api/files/reindex-stuck` | USER+PROJ | Re-ingest everything stuck in processing/error. |
| GET | `/api/files/export` | USER+PROJ | Multi-sheet .xlsx of the file list. |
| GET | `/api/stats` | USER+PROJ | Vector and table counts for the dashboard. |
| GET | `/api/indexing/status` | USER+PROJ | Per-file ingestion state. |
| GET | `/api/indexing/summary` | USER+PROJ | Aggregate queue state and ETA. |
| GET | `/api/files/{file_id}/status` | USER+PROJ | One file's ingestion state. |
| POST | `/api/files/{file_id}/retry` | USER+PROJ | Retry a failed ingestion. |
| GET | `/api/event-index/status` | USER+PROJ | Coverage of the master event memory for this project. Additive: document search readiness does not depend on it. |
| GET | `/api/event-index/metrics` | USER+PROJ | Counts and health of the event index. |
| POST | `/api/files/{file_id}/event-index/retry` | USER+PROJ | Re-run event extraction for one file. |

### Library, documents and knowledge collections

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/library` | USER+PROJ | Documents in the project. Empty project → `[]`. |
| GET | `/api/library/summary` | USER+PROJ | Counts by document type and file type. |
| GET | `/api/library/clusters` | USER+PROJ | Topic clusters with counts. |
| POST | `/api/library/clusters/recompute` | USER+PROJ | Re-cluster in the background. |
| GET | `/api/library/{doc_id}` | USER+PROJ | One document's metadata. |
| GET | `/api/docs/{doc_id}/content` | USER+PROJ | Viewer content; query `anchor`, `file_name`. |
| GET | `/api/knowledge` | USER+PROJ | Collections. Create and update take `{"name": "…", "description": "…"}`; adding documents takes `{"doc_ids": ["…"]}`. |
| POST | `/api/knowledge` | USER+PROJ | Create a collection. |
| GET | `/api/knowledge/{col_id}` | USER+PROJ | One collection with its documents. |
| PATCH | `/api/knowledge/{col_id}` | USER+PROJ | Rename / update. |
| DELETE | `/api/knowledge/{col_id}` | USER+PROJ | Delete. |
| POST | `/api/knowledge/{col_id}/documents` | USER+PROJ | Add documents. |
| DELETE | `/api/knowledge/{col_id}/documents/{doc_id}` | USER+PROJ | Remove one. |

### Chronology

Router-level gate is `USER`; the handlers resolve the project themselves.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/chronology/summary` | USER | Headline counts for the timeline. |
| GET | `/api/chronology/facets` | USER | Filter facets (types, parties, dates). |
| GET | `/api/chronology/events` | USER | The event list. |
| GET | `/api/chronology/events/document` | USER | The same as a .docx download. |
| GET | `/api/chronology/subjects` | USER | Subjects (contracts, notices, parties). |
| GET | `/api/chronology/subjects/{ref}` | USER | One subject with its events. |
| GET | `/api/chronology/subjects/{ref}/document` | USER | That subject as a .docx. |
| POST | `/api/chronology/match` | USER | Match free text to known subjects. |
| POST | `/api/chronology/build` | USER | Rebuild the chronology index. |

`/api/chronology/events` and `.../events/document` accept `?event_type=` to
filter; the available values come from `/api/chronology/facets`.

### Reports (background jobs)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/chronology/source-preview` | USER+PROJ | Which sources a chronology report would use. |
| POST | `/api/chronology/generate` | USER+PROJ | Enqueue a chronology report → `202`. |
| POST | `/api/forensic/generate` | USER+PROJ | Enqueue a forensic report → `202`. |
| GET | `/api/reports` | USER+PROJ | Job list. |
| GET | `/api/reports/{job_id}` | USER+PROJ | Job status and result. |
| POST | `/api/reports/{job_id}/retry` | USER+PROJ | Retry → `202`. |
| PATCH | `/api/reports/{job_id}/draft` | USER+PROJ | Save reviewed text / promote to an issue. |
| GET | `/api/reports/{job_id}/document` | USER+PROJ | Download the rendered document. |
| GET | `/api/reports/{job_id}/sources/{source_id}` | USER+PROJ | Resolve a footnote back to its record. |
| GET | `/api/admin/reports/{job_id}/diagnostics` | **ADMIN** | Cross-project job diagnostics, cost and model profile. |

Bodies:

```jsonc
// POST /api/chronology/generate  and  /api/chronology/source-preview
{ "topic": "…",                    // * required
  "source_doc_ids": ["…"], "parties": ["…"],
  "date_from": "2026-01-01", "date_to": "2026-06-30",
  "preparation_id": "…" }          // reuse a previewed selection

// POST /api/forensic/generate
{ "topic": "…",                    // * required
  "toolkit_artifact_ids": ["…"], "parties": ["…"], "status": "…",
  "date_from": "…", "date_to": "…" }

// PATCH /api/reports/{job_id}/draft
{ "sections": [ … ],               // * the reviewed text
  "issue": { … } }                 // optional: promote the draft to an Issue
```

### Forensic workspaces

Feature-flagged (`FORENSIC_NATIVE_UI_V1`, `FORENSIC_PARITY_UI_V1`,
`FORENSIC_PARITY_PUBLIC_V1`); when off, these answer **404**, not 403, so the
surface stays invisible. Router gate is `USER`; handlers enforce project scope
and editor rights internally.

`{module_slug}` is one of: `intake`, `dcma`, `baseline-critical-path`,
`revision-comparison`, `out-of-sequence`, `float-erosion`, `progress-s-curve`,
`resource-loading`, `sequence-coding`, `hierarchy`, `milestone-shift`,
`progress-transfer`, `as-built-critical-path`, `report-assembler`,
`as-planned-vs-as-built`, `windows-analysis`, `impacted-as-planned`,
`collapsed-as-built`, `time-impact-analysis`. `GET /api/forensic/status`
returns the live list with each module's parity state.

Bodies: workspace create/update take `{"name": "…", "programme_ids": ["…"],
"settings": {…}}`; a run takes `{"parameters": {…}, "ai_narrative": false}`;
source replacement takes `{"sources": […], "expected_version": N}`. The
workspace **state** document (`PATCH .../state`) is the analyst's working set —
around twenty optional fields (`baseline_programme_id`, `event_register`,
`narratives`, `sequence`, `windows`, …), all optimistically locked on
`expected_version`. Read its schema from `openapi.json` rather than from prose;
it changes with the analysis modules.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/forensic/status` | USER | Which modules and flags are available to this caller. |
| GET | `/api/forensic/sources` | USER | Sources eligible for analysis. |
| GET | `/api/forensic/programmes` | USER | Uploaded programme files. |
| POST | `/api/forensic/programmes` | project editor | Upload a programme → `201`. |
| DELETE | `/api/forensic/programmes/{file_id}` | project editor | Delete one → `204`. |
| GET | `/api/forensic/workspaces` | USER | Workspaces in the project. |
| POST | `/api/forensic/workspaces` | project editor | Create one. |
| GET | `/api/forensic/workspaces/{workspace_id}` | USER | One workspace. |
| PATCH | `/api/forensic/workspaces/{workspace_id}` | project editor | Rename / update settings. |
| PUT | `/api/forensic/workspaces/{workspace_id}/sources` | project editor | Replace its source set. |
| GET | `/api/forensic/workspaces/{workspace_id}/state` | USER | Saved UI/analysis state. |
| PATCH | `/api/forensic/workspaces/{workspace_id}/state` | project editor | Update that state. |
| GET | `/api/forensic/workspaces/{workspace_id}/modules/{module_slug}` | USER | One module's view model. |
| POST | `/api/forensic/workspaces/{workspace_id}/modules/{module_slug}/runs` | project editor | Run a module → `202`. |
| POST | `/api/forensic/workspaces/{workspace_id}/modules/{module_slug}/actions/{action_slug}` | project editor | Trigger a module action → `202`. |
| GET | `/api/forensic/runs` | USER | Run history. |
| GET | `/api/forensic/runs/{run_id}` | USER | One run. |
| POST | `/api/forensic/runs/{run_id}/retry` | project editor | Retry → `202`. |
| GET | `/api/forensic/artifacts/{artifact_id}/download` | USER | Download a produced artifact. |
| GET | `/api/forensic/toolkit-evidence` | USER+PROJ | Registered toolkit evidence. |
| POST | `/api/forensic/toolkit-evidence` | USER+PROJ | Register evidence → `201`. Body: `title`, `methodology`, `findings` (all required) and `source_doc_ids`. |

### Runs and feedback

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/runs` | USER+PROJ | Per-query latency, steps and status. Query `limit`. `cost_usd` is stripped for non-admins, and admins additionally see legacy uncorrelated interactions. |
| GET | `/api/runs/{run_id}` | USER+PROJ | One run in detail, including its LLM calls. |
| POST | `/api/feedback` | USER+PROJ | Thumbs up/down on an answer. Body: `conversation_id` and `vote` (required), plus `message_id`, `note`, `correction`. |
| GET | `/api/feedback/summary` | USER+PROJ | Aggregate vote counts. Reads like an admin view but is **not** admin-gated — see the limitations in [README.md](README.md). |

---

---

## How deep each part is documented

**Total: 135 operations across 112 paths — all of them listed above.** If you
find one the API serves and this document does not, that is a bug here; tell us.

The depth is not uniform, on purpose:

| Surface | Ops | Requests | Responses |
|---|--:|---|---|
| Organization (a company's SuperAdmin) | 10 | every field, with defaults and refusals | written out here, field by field |
| Platform admin (ours) | 31 | every field | written out here, field by field |
| The rest of the product | 94 | every field (one stated exception: the forensic workspace state document) | 26 have a full schema in `openapi.json` — chat, conversations, library, files, docs, knowledge, upload, indexing, i.e. everything a UI actually renders. `GET /api/projects` is written out above. The remainder (reports, runs, chronology, forensic) return loosely-typed dictionaries: call them once and read the response. |

The reason for that last cell is that those handlers are annotated as plain
dictionaries in the code, so no generator can produce their shape. If you need
any of them pinned down, ask and we will type them properly rather than have you
reverse-engineer a payload.
