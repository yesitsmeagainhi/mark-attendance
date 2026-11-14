-- These columns were added to db/schema.ts (commit 2fbe730) without a migration,
-- so inserting an employee failed with "no column named date_of_birth".
ALTER TABLE `employees` ADD COLUMN `date_of_birth` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `employees` ADD COLUMN `profile_edit_count` integer NOT NULL DEFAULT 0;
