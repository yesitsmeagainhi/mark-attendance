CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`punch_type` text NOT NULL,
	`server_timestamp` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`photo_key` text NOT NULL,
	`content_type` text DEFAULT 'image/jpeg' NOT NULL,
	`office` text NOT NULL,
	`latitude` text,
	`longitude` text,
	`user_agent` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`role` text DEFAULT 'employee' NOT NULL,
	`job_role` text DEFAULT '' NOT NULL,
	`mobile_number` text DEFAULT '' NOT NULL,
	`work_start_time` text DEFAULT '09:00' NOT NULL,
	`work_end_time` text DEFAULT '18:00' NOT NULL,
	`office` text DEFAULT 'Bhayandar Office' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_email_unique` ON `employees` (`email`);
--> statement-breakpoint
INSERT OR IGNORE INTO `employees` (`id`, `name`, `email`, `password`, `role`, `job_role`, `mobile_number`, `work_start_time`, `work_end_time`, `office`, `active`)
VALUES ('EMP-1007', 'Naresh M.', 'naresh@example.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 'Administrator', '', '09:00', '18:00', 'Bhayandar Office', 1);
