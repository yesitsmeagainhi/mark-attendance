CREATE TABLE IF NOT EXISTS `activity_log` (
  `id` text PRIMARY KEY NOT NULL,
  `action_type` text NOT NULL,
  `performed_by` text NOT NULL,
  `performed_by_name` text NOT NULL,
  `target_id` text,
  `target_name` text,
  `description` text NOT NULL,
  `metadata` text,
  `timestamp` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
