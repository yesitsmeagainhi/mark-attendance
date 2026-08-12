CREATE TABLE IF NOT EXISTS attendance_rules (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    value_type TEXT NOT NULL CHECK(value_type IN ('number', 'boolean')),
    default_value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS employee_rule_overrides (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    rule_id TEXT NOT NULL REFERENCES attendance_rules(id),
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS employee_rule_overrides_emp_rule
  ON employee_rule_overrides(employee_id, rule_id);
--> statement-breakpoint
INSERT OR IGNORE INTO attendance_rules (id, label, description, value_type, default_value)
VALUES
  ('grace_period', 'Grace Period (minutes)', 'Minutes after shift start before marking late', 'number', '15'),
  ('lunch_break_enabled', 'Lunch Break', 'Allow employees to punch out for lunch and punch back in', 'boolean', 'false'),
  ('lunch_break_min_hours', 'Lunch Break Min Hours', 'Minimum hours after first punch-in before a second punch-in is allowed', 'number', '4');
