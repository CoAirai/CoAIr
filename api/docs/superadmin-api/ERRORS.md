# Error Contracts

Two shapes exist. Handle both.

**1. FastAPI default** — everything raised as an HTTP error:

```json
{ "detail": "user_not_found" }
```

`detail` is a stable machine string (occasionally an object, see 409 below).
Match on it; do not show it raw to end users.

**2. Domain envelopes** — quota/budget failures, which carry an `error` code
plus the numbers your UI needs to explain the situation:

```json
{ "detail": "…human sentence…", "error": "credit_balance_exhausted", "…": … }
```

---

## Domain envelopes

These are raised by the platform, not by a single endpoint — any call that runs
an LLM or stores a file can return them.

### 402 `budget_exceeded`
The **global** LLM budget for the whole deployment is spent. Not user-specific.
```json
{ "detail": "…", "error": "budget_exceeded" }
```
Admin action: raise `COAIR_USAGE_LIMIT_USD`, or `POST /api/usage/reset`.

### 402 `token_quota_exceeded`
The account hit its `token_limit`.
```json
{ "detail": "Token quota exceeded for acme: 1000000 / 1000000",
  "error": "token_quota_exceeded",
  "used_tokens": 1000000, "token_limit": 1000000, "percent_remaining": 0.0 }
```
Admin action: raise `token_limit` (PATCH the user) or
`POST /api/admin/users/{username}/reset-usage`.

### 402 `credit_balance_exhausted`
A `demo`-plan account is out of credits.
```json
{ "detail": "…", "error": "credit_balance_exhausted",
  "credits_remaining": 0.0, "credit_percent_remaining": 0.0 }
```
Admin action: `POST /api/admin/users/{username}/credits`.

### 413 `storage_quota_exceeded`
An upload would exceed the account's storage limit. Raised **before** the file
is stored.
```json
{ "detail": "…", "error": "storage_quota_exceeded",
  "storage_used_bytes": 29999000000, "storage_limit_bytes": 30000000000,
  "attempted_bytes": 5000000 }
```
Admin action: raise `storage_limit_bytes`, or have the user delete files.

### 503 `provider_credential_unavailable`
The AI credential for that account is missing or rejected. The message is
deliberately vague — it never leaks key aliases or filesystem paths.
```json
{ "detail": "The dedicated AI service credential is unavailable.",
  "error": "provider_credential_unavailable" }
```
Admin action: re-bind `provider_key_ref`, or check the platform-wide key.

---

## Status codes

| Status | `detail` | When |
|---|---|---|
| 400 | `invalid role: 'root'` | Unknown role on create/patch |
| 400 | `username already exists: acme` | Duplicate username |
| 401 | `not_authenticated` | Missing/malformed `Authorization` header |
| 401 | `token_expired` / `invalid_token` / `unknown_user` | Bad or stale token → re-login |
| 401 | `invalid_credentials` | Login failed |
| 403 | `account_disabled` | `is_active = false` |
| 403 | `admin_required` | Caller is a plain user |
| 403 | `superadmin_required:create_operator` | An admin tried to create an admin/superadmin |
| 403 | `superadmin_required:promote_operator` | An admin tried to promote a user to operator |
| 403 | `superadmin_required:modify_operator` | An admin tried to edit an operator account |
| 403 | `superadmin_required:delete_operator` | An admin tried to delete an operator account |
| 403 | `cannot_change_own_role` | Self-promotion/demotion, any role |
| 403 | `cannot_delete_self` | Deleting your own account |
| 403 | `feature_not_available:correspondence` | Feature flag off for that user |
| 403 | `project_editor_required` / `project_owner_required` | Insufficient project role |
| 404 | `user_not_found` | Unknown username |
| 404 | `project_not_found` | Unknown project **or** caller not a member (deliberate) |
| 404 | `forensic_native_ui_disabled` / `forensic_parity_ui_disabled` | Feature flag off — 404, not 403, so the surface stays invisible |
| 403 | `organization_required` | The caller belongs to no company (org routes only) |
| 403 | `org_owner_required` | Company member attempting a SuperAdmin action, or creating a project when `allow_member_projects` is false |
| 403 | `organization_archived` | The caller's company has been archived |
| 404 | `organization_not_found` | Unknown company, or `X-Org-ID` naming one |
| 422 | `user_not_in_organization` | Granting a project to someone outside the company |
| 422 | `cross_org_membership` | Same, caught in the store — no route can bypass it |
| 409 | `user already belongs to an organization` | A user may belong to exactly one |
| 409 | `last_org_owner` | Would leave a company with no owner |
| 409 | `last_project_owner` | Would leave a project with no owner |
| 409 | `org_project_limit_reached` | The company is at its project limit |
| 409 | `{"error": "members_outside_organization", "in_another_organization": [...], "unaffiliated": [...]}` | Attaching a project whose members are not all in that company. **`detail` is an object here.** |
| 409 | `last_superadmin` | Would leave the system with no active superadmin |
| 409 | `{"error": "embedding_profile_unavailable", "project_profile": "…", "server_profile": "…"}` | Project embeddings incompatible with the server. **`detail` is an object here.** |
| 422 | validation error array | Pydantic body validation — standard FastAPI `detail` list of `{loc, msg, type}` |
| 422 | `…` (string) | Rejected credit adjustment, e.g. a conflicting idempotency key |
| 428 | `project_required` | `X-Project-ID` missing on a content endpoint |
| 503 | health payload | `GET /api/health` when a runtime dependency is down |

## Client rules of thumb

- **401 → drop the token and route to login.** There is no refresh; retrying the
  same token cannot succeed.
- **403 is final for that call.** Never retry; the answer will not change.
- **402/413 are actionable** — show the numbers from the envelope and, for an
  operator, a direct link to the account's credit/limit controls.
- **409 `last_superadmin` / `last_org_owner` / `last_project_owner` and the
  `cannot_*` 403s are policy, not failures.** Best handled by disabling the
  control up front and explaining why.
- **404 on an org route usually means "not in your company", not "does not
  exist".** That is deliberate — it keeps one customer from discovering another
  customer's usernames and project ids by probing. Render it as "not found in
  this organization".
