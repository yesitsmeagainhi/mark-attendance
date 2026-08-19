-- Rename existing rule: minimum_hours_for_present -> minimum_hours_for_full_day
UPDATE attendance_rules
SET id = 'minimum_hours_for_full_day',
    label = 'Minimum hours for full day',
    description = 'Minimum working hours to count as a full day present. Between half-day and this = half day.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'minimum_hours_for_present';
--> statement-breakpoint
-- Update any employee overrides that reference the old rule ID
UPDATE employee_rule_overrides
SET rule_id = 'minimum_hours_for_full_day',
    updated_at = CURRENT_TIMESTAMP
WHERE rule_id = 'minimum_hours_for_present';
--> statement-breakpoint
-- Insert the new half-day rule
INSERT OR IGNORE INTO attendance_rules (id, label, description, value_type, default_value)
VALUES (
  'minimum_hours_for_half_day',
  'Minimum hours for half day',
  'Minimum working hours to count as a half day. Below this = absent. Between this and full-day threshold = half day.',
  'number',
  '2'
);
