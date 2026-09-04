# COAir security checklist

## Implemented (Wave 1 + Wave 2)

| Control | Location | Notes |
| --- | --- | --- |
| Account lifecycle `account_status` | `users.account_status`; `src/user_store.py`; enforced in `backend/api/auth.py` login/MFA + `backend/core/security.py` `get_current_user` | Only `active` may login / complete MFA / call protected APIs. Invited users may still use invite preview / resend / activate. |
| Sync `is_active` ↔ status | `UserStore.create_user` / `update_user` | `active` ⇒ `is_active=1`, else `0` |
| Single-use invite tokens (48h) | `invite_tokens` table; `OpsStore.peek/consume_invite_token`; migration `005_invite_tokens.sql` | Link: `/auth/accept-invite?token=…` (no email in URL) |
| Token ↔ email ↔ org binding | Activate peeks token, derives email, checks optional email/org mismatch + membership org | Blocks token substitution |
| Invite activate = token + OTP + password | `POST /auth/invite/activate` | Consumes OTP + token then sets `ACTIVE` |
| Invite preview for UI | `GET /auth/invite/preview?token=` | Returns email (+ hint) after token validation |
| MFA / email OTP attempt limit (5) | `attempt_count` on MFA + email_verifications | 5th failure burns challenge |
| MFA TTL 10 min + rate limits | `POST /auth/mfa/verify` | 10/min IP / token / account |
| MFA always on | `POST /auth/login` | Every active account (member, company admin, Super Admin) |
| Remember device (30d) | `trusted_devices`; MFA verify `remember_device` | Company admin/member only — Super Admin never skips MFA |
| Dev codes hidden in UI | `lib/coair/debugFlags.ts` | Shown only if `NEXT_PUBLIC_COAIR_SHOW_DEBUG_CODES=1`; API still omits `debug_code` when `COAIR_ENV=production` |
| Tenant binding | `backend/core/orgs.py` | Membership from DB; `X-Org-ID` operators only |
| IDOR pack | `tests/test_tenant_idor.py`, `tests/test_security_wave1.py` | Cross-tenant users/projects/billing/usage/invites; role denials; non-active JWT blocked |

## Still required (you run)

1. **Supabase SQL** (if not already): `004_account_status.sql`, `005_invite_tokens.sql`, then `006_trusted_devices.sql`
2. Confirm VPS `COAIR_ENV=production` (no API `debug_code`)
3. Do **not** set `NEXT_PUBLIC_COAIR_SHOW_DEBUG_CODES` on Vercel production

## Wave 3 — next

- File magic-byte + size limits + private signed URLs
- Malware scan hook
- Stripe webhook idempotency + replay window
- Super Admin re-auth for sensitive actions

## Wave 4 — next

- Secrets manager / KMS
- Audit alerts + CVE scanning in CI
- Broader suite: SSRF, upload bypass, JWT attacks

## Residual risk

- Invite token in email can still be forwarded; mitigated by single-use + OTP + 48h + email/org bind
- Cross-DB activate is best-effort atomic (ops + users stores); Postgres shared DB reduces risk
- File upload / Stripe replay / KMS remain Wave 3–4
