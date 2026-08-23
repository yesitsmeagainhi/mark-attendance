-- Device push tokens, so the server can reach a phone whose app is closed.
-- One row per device; the token is the primary key because FCM re-issues the
-- same token to the same app install, and a device may change hands between
-- employees (the employee_id is simply overwritten on the next registration).
CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS push_tokens_employee_idx ON push_tokens(employee_id);
