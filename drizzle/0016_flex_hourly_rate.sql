-- Add hourly_rate to employees for lecture/flex-schedule employees
-- For employees with flexible_hours = 1, payroll is calculated as
-- total_hours_worked * hourly_rate instead of the monthly salary deduction model.
ALTER TABLE employees ADD COLUMN hourly_rate INTEGER NOT NULL DEFAULT 0;
