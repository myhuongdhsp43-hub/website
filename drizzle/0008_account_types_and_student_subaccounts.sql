ALTER TABLE `schools` ADD `account_type` text DEFAULT 'school';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `student_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `school_id` text NOT NULL REFERENCES `schools`(`id`),
  `student_id` text REFERENCES `students`(`id`),
  `username` text NOT NULL,
  `password_hash` text NOT NULL,
  `password_salt` text NOT NULL,
  `full_name` text NOT NULL,
  `class_name` text NOT NULL,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_student_accounts_school_username` ON `student_accounts` (`school_id`, `username`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_student_accounts_school_id` ON `student_accounts` (`school_id`);--> statement-breakpoint
ALTER TABLE `devices` ADD `api_url` text;
