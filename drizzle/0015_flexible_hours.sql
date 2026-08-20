-- Add flexible_hours flag to employees table
-- When enabled, employee is exempt from late and duration-based attendance rules
ALTER TABLE employees ADD COLUMN flexible_hours INTEGER NOT NULL DEFAULT 0;
