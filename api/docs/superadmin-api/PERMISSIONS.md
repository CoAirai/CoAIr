# Who Can Do What

The complete permission model. Read this before designing navigation: which
screens exist for a given user is decided here, and the server enforces every
line of it.

## The three questions

Authorization answers three independent questions. A request has to pass all
three that apply to it.

1. **What are you on the platform?** — the global role on your account:
   `user`, `admin`, `superadmin`. Carried in the JWT.
2. **What are you inside your company?** — your organization role: `owner`
   (the company's SuperAdmin) or `member`. Read from the database on every
   request, never from the token.
3. **What are you on this project?** — your project role: `owner`, `editor` or
   `viewer`, taken from project membership, or granted company-wide if you are
   the owner of the company that owns the project.

They are orthogonal. A company SuperAdmin is a **global `user`** with an
**organization role of `owner`**. Gating a panel on the global role would hide
the whole company admin area from exactly the person it is built for.

---

## 1. Platform roles (ours)

| | `user` | `admin` | `superadmin` |
|---|:--:|:--:|:--:|
| Use the product (chat, files, reports…) | ✅ own projects | ✅ every project | ✅ every project |
| `GET /api/admin/users` — every account on the platform | ⛔ | ✅ | ✅ |
| Create / edit / deactivate an **ordinary** account | ⛔ | ✅ | ✅ |
| Create / promote / demote / delete an **operator** account (`admin`, `superadmin`) | ⛔ | ⛔ `superadmin_required:*` | ✅ |
| Adjust credits, reset token usage | ⛔ | ✅ | ✅ |
| Create companies, appoint their SuperAdmins (`/api/admin/orgs*`) | ⛔ | ✅ | ✅ |
| Global spend and billing breakdown (`/api/usage`, `/api/admin/usage`) | ⛔ | ✅ | ✅ |
| Operational tools (data tables, jargon, flywheel, demo cleanup) | ⛔ | ✅ | ✅ |
| Report diagnostics across projects | ⛔ | ✅ | ✅ |
| See `cost_usd` on query runs | ⛔ | ✅ | ✅ |
| Act inside a customer company with `X-Org-ID` | ⛔ ignored | ✅ | ✅ |
| Reach **any** project by id, without membership | ⛔ | ✅ | ✅ |

`admin` and `superadmin` are identical everywhere except operator management.
The tier exists so a day-to-day operator cannot manufacture peers, remove the
account above it, or promote itself. **28 of the 128 operations are
platform-only.**

Nobody — at any tier — can change their own role or delete their own account,
and the last active `superadmin` cannot be demoted, disabled or deleted.

---

## 2. Organization roles (the customer's)

An organization is a customer company. A user belongs to exactly one.

### The company SuperAdmin — org `owner`

**Can:**

| Capability | How |
|---|---|
| See the company: name, plan policy, member and project counts | `GET /api/org` |
| List every account in the company, with usage, credits and storage | `GET /api/org/users` |
| Create an account inside the company | `POST /api/org/users` |
| Rename, set a password, deactivate an account | `PATCH|DELETE /api/org/users/{username}` |
| Promote another member to co-SuperAdmin, or demote one | `PATCH /api/org/users/{username}` with `org_role` |
| See **every project the company owns**, including ones it never joined | `GET /api/org/projects`, and `GET /api/projects` |
| Open any of those projects and use the product inside them, as `owner` | `X-Project-ID` on any content endpoint |
| See who can reach a project | `GET /api/org/projects/{project_id}/members` |
| Grant a company user access to a company project, at `owner`/`editor`/`viewer` | `PUT /api/org/projects/{project_id}/members/{username}` |
| Revoke that access | `DELETE /api/org/projects/{project_id}/members/{username}` |
| Create projects for the company | `POST /api/projects` (subject to `project_limit`) |
| See whole-project spend on the company's projects | `usage` block on `GET /api/projects` |

**Cannot** — and these are enforced, not merely undocumented:

| Attempt | What happens |
|---|---|
| Create an `admin` or `superadmin` account | The request model has no `role` field. Accounts are always plain `user`. |
| Give an account more credits, quota or storage than the company policy | `plan_type`, `initial_credits`, `token_limit`, `storage_limit_bytes` are not accepted in the body; they come from the company policy, which only we can change. |
| Adjust credits at all | No credit endpoint exists on `/api/org/*`. Credits stay a platform action. |
| Assign the legacy `corpus` feature flag | Filtered out; only `correspondence` and `provider_compare` are assignable. |
| See our margin — `markup_percent`, `model_policy`, `dedicated_provider_key`, provider cost | Not in the org user payload at all. |
| Touch a user or project of another company | `404` — deliberately not `403`, so other companies' usernames and project ids cannot be probed. |
| Grant a project to someone outside the company | `422 user_not_in_organization`, and `422 cross_org_membership` if attempted through the older project route — the check is in the store, so no route can bypass it. |
| Reach a project that belongs to no company | Invisible. An unaffiliated project is only reachable by its explicit members. |
| Change its own org role, or remove the last owner | `403 cannot_change_own_role`, `409 last_org_owner`. |
| Call any `/api/admin/*` route | `403 admin_required`. |
| Exceed the company's project limit | `409 org_project_limit_reached`. |
| Act inside another company with `X-Org-ID` | The header is ignored for anyone who is not one of our operators. |

### Company member — org `member`

| | |
|---|---|
| **Can** | Read its own company via `GET /api/org`; use the product fully inside the projects it was granted, at the project role it was given. |
| **Cannot** | Every `/api/org/users*` and `/api/org/projects*` route → `403 org_owner_required`. See, name or reach a company project it was not granted — those projects are simply absent from `GET /api/projects` and answer `404` on `X-Project-ID`. Create projects, unless the company has `allow_member_projects` enabled → otherwise `403 org_owner_required`. |

### Unaffiliated account — no organization

Accounts that predate organizations. Nothing changed for them: their projects
belong to no company, only their own memberships apply, and they may create
projects freely. Every `/api/org/*` route answers `403 organization_required`.

---

## 3. Project roles

Inside a project the role decides what you may do with its data.

| | `viewer` | `editor` | `owner` |
|---|:--:|:--:|:--:|
| Read documents, ask questions, run reports | ✅ | ✅ | ✅ |
| Upload files, re-index, delete files | ⛔ `project_editor_required` | ✅ | ✅ |
| Forensic workspaces: create, run modules, edit state | ⛔ | ✅ | ✅ |
| Rename or archive the project | ⛔ | ⛔ `project_owner_required` | ✅ |
| Add, list or remove project members | ⛔ | ⛔ | ✅ |

The last owner of a project cannot be removed (`409 last_project_owner`) — a
project with no owner could never be renamed, shared or archived again.

**How the role is decided:** an explicit `project_members` row, or `owner`
granted by company reach if you are the owner of the company that owns the
project, or `owner` for one of our platform operators. Every project record
tells you which of the three applied, in `role_source`: `member`, `org` or
`platform`.

---

## 4. What a role never overrides

- **Project data isolation.** Every document, vector, table, conversation,
  report and job is scoped by `project_id`. A role changes which projects you
  may select, never what a project contains.
- **Quota and budget.** A `402` or `413` is about the account's credits, tokens
  or storage, not about permissions. No role bypasses them; a platform operator
  raises the limit instead.
- **Feature flags.** `correspondence` and `provider_compare` are per account and
  independent of role — a company SuperAdmin without the flag gets
  `403 feature_not_available:<name>` like anyone else.

---

## 5. Building the navigation

```
GET /api/auth/me   → user.role       // platform tier: 'user' | 'admin' | 'superadmin'
GET /api/org       → role            // company tier:  'owner' | 'member'
                                     // 403 organization_required = no company
```

| Section | Show when |
|---|---|
| Company admin area (users, projects, access) | `GET /api/org` returns `role === 'owner'` |
| "My company" read-only summary | `GET /api/org` succeeds at all |
| Platform console (all companies, all accounts, billing) | `user.role === 'admin' \|\| user.role === 'superadmin'` |
| Operator management inside that console | `user.role === 'superadmin'` |
| Project settings (rename, archive, members) | the project's `role === 'owner'` |
| Upload / ingest controls | the project's `role !== 'viewer'` |

Treat the server's `403`/`404` as the authority and the client-side checks as
cosmetics: they exist so a user is not offered a button that will fail, not as
the security boundary.
