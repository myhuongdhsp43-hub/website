CREATE TABLE IF NOT EXISTS `app_sessions_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
INSERT OR IGNORE INTO `app_sessions_new` (`id`, `user_id`, `token_hash`, `expires_at`, `created_at`)
SELECT `id`, `user_id`, `token_hash`, `expires_at`, `created_at` FROM `app_sessions`;--> statement-breakpoint
DROP TABLE `app_sessions`;--> statement-breakpoint
ALTER TABLE `app_sessions_new` RENAME TO `app_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_app_sessions_token_hash` ON `app_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_app_sessions_user_expires` ON `app_sessions` (`user_id`,`expires_at`);
