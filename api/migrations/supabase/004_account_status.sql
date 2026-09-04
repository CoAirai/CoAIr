-- Account lifecycle status on users.
-- Values: pending_approval | approved | invited | active | suspended | disabled | rejected

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

UPDATE users
SET account_status = CASE
    WHEN COALESCE(is_active, 1) = 1 THEN 'active'
    ELSE 'invited'
END
WHERE account_status IS NULL OR account_status = '';

CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
