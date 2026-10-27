ALTER TABLE `users` ADD `username` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `password_salt` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_username` ON `users` (`username`);
--> statement-breakpoint
CREATE TABLE `app_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_app_sessions_token_hash` ON `app_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_app_sessions_user_expires` ON `app_sessions` (`user_id`,`expires_at`);
