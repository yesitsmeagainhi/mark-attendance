ALTER TABLE `employees` ADD COLUMN `monthly_salary` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `attendance` ADD COLUMN `source` text DEFAULT 'selfie' NOT NULL;
--> statement-breakpoint
CREATE TABLE `holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holidays_date_unique` ON `holidays` (`date`);
