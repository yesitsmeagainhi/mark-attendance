-- Office-wide settings that are plain text, one row per key. attendance_rules
-- cannot carry these: its value_type is only 'number' or 'boolean', and every
-- row in it is an attendance rule an admin may override per employee. These are
-- single office-wide strings instead, so they get their own key/value table.
-- Keys in use: 'employee_form_url', 'employee_form_label'. A missing row simply
-- means "never set" and the API falls back to its own default.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
