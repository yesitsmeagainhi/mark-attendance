-- Overtime: the shift's unpaid break (lunch). Working hours per day are the
-- shift length minus this break, so overtime only counts real work beyond them
-- and the overtime hourly rate is per working hour. 0 keeps the old behaviour.
INSERT OR IGNORE INTO attendance_rules (id, label, description, value_type, default_value, category, sort_order)
VALUES (
  'shift_break_minutes',
  'Unpaid break in shift (minutes)',
  'Lunch / break time included in the shift timings (e.g. 60 for a 9:00–18:00 shift with a 1-hour lunch). Working hours = shift minus this break. Overtime is time worked beyond the working hours, and the overtime hourly rate is per working hour. If the employee doesn''t punch out for the break, it is assumed taken.',
  'number',
  '0',
  'overtime',
  15
);
