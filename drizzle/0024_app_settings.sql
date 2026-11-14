-- Key/value app settings (e.g. company name and address on payslips).
-- The table was declared in db/schema.ts but never created by a migration.
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
