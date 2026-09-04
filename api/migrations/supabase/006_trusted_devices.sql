-- Remembered browsers for company users (not Super Admin).
-- TTL enforced in app (default 30 days).

CREATE TABLE IF NOT EXISTS trusted_devices (
    device_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user
    ON trusted_devices(username, expires_at);
