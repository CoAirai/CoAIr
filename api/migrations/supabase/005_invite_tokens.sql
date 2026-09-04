-- Single-use invite tokens (hashed) for company owner / team invites.

CREATE TABLE IF NOT EXISTS invite_tokens (
    token_id TEXT PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    org_id TEXT,
    purpose TEXT NOT NULL DEFAULT 'invite',
    created_by TEXT,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_email
    ON invite_tokens(email, expires_at);

-- OTP attempt counters (fail closed after too many wrong codes).
ALTER TABLE mfa_challenges ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
