-- Rule engine for automatic salary: group rules into categories and add
-- penalty, overtime and leave-policy rules. Every default reproduces the
-- salary calculation that existed before this migration.
ALTER TABLE attendance_rules ADD COLUMN category TEXT NOT NULL DEFAULT 'attendance';
--> statement-breakpoint
ALTER TABLE attendance_rules ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE attendance_rules SET category = 'attendance', sort_order = 10 WHERE id = 'grace_period';
--> statement-breakpoint
UPDATE attendance_rules SET category = 'attendance', sort_order = 20 WHERE id = 'minimum_hours_for_half_day';
--> statement-breakpoint
UPDATE attendance_rules SET category = 'attendance', sort_order = 30 WHERE id = 'minimum_hours_for_full_day';
--> statement-breakpoint
UPDATE attendance_rules SET category = 'attendance', sort_order = 40 WHERE id = 'lunch_break_enabled';
--> statement-breakpoint
UPDATE attendance_rules SET category = 'attendance', sort_order = 50 WHERE id = 'lunch_break_min_hours';
--> statement-breakpoint
-- Payroll has always deducted half a day per block of late marks; make the label say so
UPDATE attendance_rules
SET category = 'penalty', sort_order = 10,
    label = 'Late marks per penalty',
    description = 'Every this many late marks in a month triggers a salary deduction (see "Days deducted per late penalty"). 0 turns the late penalty off.'
WHERE id = 'late_to_absent_count';
--> statement-breakpoint
INSERT OR IGNORE INTO attendance_rules (id, label, description, value_type, default_value, category, sort_order)
VALUES
  ('late_penalty_days', 'Days deducted per late penalty', 'Salary days deducted each time the late-mark count is reached (0.5 = half a day).', 'number', '0.5', 'penalty', 20),
  ('late_fine_amount', 'Fine per late mark (₹)', 'Fixed amount deducted for every single late mark, on top of the day deduction. 0 = no fine.', 'number', '0', 'penalty', 30),
  ('half_day_deduction', 'Deduction per half day (days)', 'Salary days deducted for each half day (worked between the half-day and full-day hours).', 'number', '0.5', 'penalty', 40),
  ('overtime_enabled', 'Pay overtime', 'Pay extra for time worked beyond the shift length on full working days.', 'boolean', 'false', 'overtime', 10),
  ('overtime_min_minutes', 'Minimum overtime per day (minutes)', 'Extra time on a day only counts as overtime once it reaches this many minutes.', 'number', '30', 'overtime', 20),
  ('overtime_rate_multiplier', 'Overtime pay rate (× hourly)', 'Overtime hours are paid at this multiple of the hourly rate (monthly salary ÷ days in month ÷ shift hours).', 'number', '1.5', 'overtime', 30),
  ('overtime_max_hours_month', 'Overtime cap per month (hours)', 'Maximum overtime hours paid in a month. 0 = no cap.', 'number', '0', 'overtime', 40),
  ('leave_sick_quota', 'Sick leave per year (days)', 'Paid sick leave days allowed per calendar year. Approved days beyond this are unpaid. 0 = unlimited.', 'number', '0', 'leave', 10),
  ('leave_sick_paid', 'Sick leave is paid', 'When off, every approved sick leave day is deducted from salary.', 'boolean', 'true', 'leave', 20),
  ('leave_casual_quota', 'Casual leave per year (days)', 'Paid casual leave days allowed per calendar year. Approved days beyond this are unpaid. 0 = unlimited.', 'number', '0', 'leave', 30),
  ('leave_casual_paid', 'Casual leave is paid', 'When off, every approved casual leave day is deducted from salary.', 'boolean', 'true', 'leave', 40),
  ('leave_earned_quota', 'Earned leave per year (days)', 'Paid earned leave days allowed per calendar year. Approved days beyond this are unpaid. 0 = unlimited.', 'number', '0', 'leave', 50),
  ('leave_earned_paid', 'Earned leave is paid', 'When off, every approved earned leave day is deducted from salary.', 'boolean', 'true', 'leave', 60);
--> statement-breakpoint
-- Shift templates: assigning a shift copies its timings onto the employee
CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE employees ADD COLUMN shift_id TEXT REFERENCES shifts(id);
