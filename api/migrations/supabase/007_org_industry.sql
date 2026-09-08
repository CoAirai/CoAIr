-- Company industry (editable by company owner in settings).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT '';
