-- Holiday list: named holidays that can be paid or unpaid.
-- Existing rows default to paid so past payroll figures stay unchanged.
ALTER TABLE holidays ADD COLUMN name TEXT NOT NULL DEFAULT 'Holiday';
--> statement-breakpoint
ALTER TABLE holidays ADD COLUMN paid INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
-- Per-employee eligibility for paid holidays (default: eligible)
ALTER TABLE employees ADD COLUMN paid_holidays INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
-- Per-holiday, per-employee exceptions to the default paid/unpaid outcome
CREATE TABLE IF NOT EXISTS holiday_employee_overrides (
  id TEXT PRIMARY KEY,
  holiday_id TEXT NOT NULL REFERENCES holidays(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  paid INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(holiday_id, employee_id)
);
