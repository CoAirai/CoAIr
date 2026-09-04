-- Email verification challenges for signup / invite proofs.
CREATE TABLE IF NOT EXISTS email_verifications (
    challenge_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    proof_hash TEXT,
    expires_at TEXT NOT NULL,
    verified_at TEXT,
    consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_email
    ON email_verifications(email, purpose, expires_at);
