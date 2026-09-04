# COAir security checklist

## Implemented (Wave 1 + Wave 2)

| Control | Location | Notes |
| --- | --- | --- |
| Account lifecycle `account_status` | `users.account_status`; `src/user_store.py`; enforced in `backend/api/auth.py` login/MFA + `backend/core/security.py` `get_current_user` | Only `active` may authenticate or call APIs. Errors: `invite_not_activated`, `account_<status>` |
| Sync `is_active` ↔ status | `UserStore.create_user` / `update_user` | `active` ⇒ `is_active=1`, else `0` |
| Single-use invite tokens (48h) | `invite_tokens` table; `OpsStore.create_invite_token` / `consume_invite_token`; migration `005_invite_tokens.sql` | Link: `/auth/accept-invite?email=…&token=…` |
| Invite activate = token + email OTP + password | `POST /auth/invite/activate` | Token peeked before OTP; consumed only after OTP succeeds |
| Invite emails + Accept Invite UI | `src/auth_provision.py`, `src/email_delivery.py`, `templates/Auth/AcceptInvitePage` | Token in query string; manual field if link lacks token |
| MFA / email OTP attempt limit (5) | `mfa_challenges.attempt_count`, `email_verifications.attempt_count` | Wrong code increments; 5th failure burns challenge (`otp_attempts_exceeded`) |
| MFA TTL 10 min | `OpsStore.MFA_TTL_MINUTES` | Unchanged |
| Tighter MFA rate limits | `POST /auth/mfa/verify` | 10/min/IP, 10/min/token, 10/min/account |
| Tenant binding | `backend/core/orgs.py` `require_org` / `require_org_owner`; membership from DB not JWT | `X-Org-ID` only for platform operators |
| IDOR test pack | `tests/test_tenant_idor.py`, `tests/test_security_wave1.py` | Cross-tenant project/org, member invite denial, non-active JWT rejected |
| Vector project scope | `tests/test_vector_project_isolation.py` (+ smoke in IDOR pack) | Fail-closed without `project_id` |

## Still required (you run)

1. **Supabase SQL** (SQL editor), in order:
   - `coair 1/migrations/supabase/004_account_status.sql`
   - `coair 1/migrations/supabase/005_invite_tokens.sql`
2. Redeploy API after migrations (`deploy/vps-redeploy.sh` on VPS).
3. Confirm `COAIR_ENV=production` so MFA debug codes are not returned.
4. Confirm `RESEND_API_KEY` so invite/MFA codes deliver live.

## Wave 3 — next (not shipped)

- File magic-byte + size limits + private signed URLs
- Malware scan hook (async quarantine)
- Stripe webhook idempotency table + replay window
- Super Admin re-auth for sensitive actions

## Wave 4 — next (ops / continuous)

- Secrets manager / KMS off plaintext `.env` where feasible
- Immutable audit hardening + alerts (auth bursts, SA actions)
- Dependency CVE scanning in CI
- Broader suite: SSRF, upload bypass, JWT attacks

## Residual risk

- Invite tokens in email links can be forwarded; mitigated by single-use + OTP + 48h TTL
- Local JWT forging only works if `JWT_SECRET` leaks; non-`active` status still blocks API use
- File upload / Stripe replay / KMS remain Wave 3–4
- Argon2 / WebAuthn / TOTP out of scope this pass (bcrypt retained)
