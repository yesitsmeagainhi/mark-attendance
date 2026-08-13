CREATE TABLE IF NOT EXISTS `departments` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_unique` ON `departments` (`name`);
--> statement-breakpoint
ALTER TABLE `employees` ADD COLUMN `department` text NOT NULL DEFAULT '';
