-- Coming in very late turns the day into a half day (paid as a half day).
-- Minutes after the shift start; 0 turns the rule off.
INSERT OR IGNORE INTO attendance_rules (id, label, description, value_type, default_value, category, sort_order)
VALUES (
  'late_half_day_minutes',
  'Late by this much = half day (minutes)',
  'If an employee punches in this many minutes or more after their shift start, that day counts as a half day, and the half-day deduction applies instead of a late mark. Example: 60 for a 9:00 shift means a punch-in at 10:00 or later is a half day. 0 = off.',
  'number',
  '60',
  'attendance',
  15
);
