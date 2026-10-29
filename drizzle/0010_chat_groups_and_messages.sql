CREATE TABLE IF NOT EXISTS `chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL REFERENCES `schools`(`id`),
	`type` text NOT NULL DEFAULT 'direct',
	`title` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_conversations_school` ON `chat_conversations` (`school_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL REFERENCES `chat_conversations`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL,
	`user_type` text NOT NULL,
	`user_name` text NOT NULL,
	`joined_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_chat_participants_conv_user` ON `chat_participants` (`conversation_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_participants_user` ON `chat_participants` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL REFERENCES `chat_conversations`(`id`) ON DELETE CASCADE,
	`sender_id` text NOT NULL,
	`sender_type` text NOT NULL,
	`sender_name` text NOT NULL,
	`message` text NOT NULL,
	`file_url` text,
	`file_name` text,
	`file_type` text,
	`file_size` integer,
	`is_alert` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_messages_conv_created` ON `chat_messages` (`conversation_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_files` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL REFERENCES `schools`(`id`),
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`total_chunks` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_file_chunks` (
	`file_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY (`file_id`, `chunk_index`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_file_chunks_file` ON `chat_file_chunks` (`file_id`);
