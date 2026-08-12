INSERT OR IGNORE INTO attendance_rules (id, label, description, value_type, default_value)
VALUES
  ('late_to_absent_count', 'Late Marks per Absent', 'Number of late marks that count as one absent day (e.g. 3 means every 3 lates = 1 absent)', 'number', '3');
