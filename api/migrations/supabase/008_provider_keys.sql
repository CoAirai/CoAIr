-- Virtual Gemini sub-keys (COAir tracking aliases under the platform GOOGLE_API_KEY).
CREATE TABLE IF NOT EXISTS provider_key_registry (
    key_ref TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'gemini',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT '',
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_provider_key_registry_status
    ON provider_key_registry(status, created_at);

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS provider_key_ref TEXT NOT NULL DEFAULT '';

ALTER TABLE billing_ledger
    ADD COLUMN IF NOT EXISTS provider_key_ref TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_billing_ledger_provider_key
    ON billing_ledger(provider_key_ref, created_at);
