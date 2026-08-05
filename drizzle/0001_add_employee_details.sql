-- Add job_role, mobile_number, work_start_time, work_end_time columns to employees
-- Safe to run on existing databases — ALTER TABLE ADD COLUMN is a no-op if column exists in SQLite 3.37+
ALTER TABLE `employees` ADD COLUMN `job_role` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD COLUMN `mobile_number` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD COLUMN `work_start_time` text DEFAULT '09:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD COLUMN `work_end_time` text DEFAULT '18:00' NOT NULL;
