ALTER TABLE `system_settings` ADD `helmet_detection_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `system_settings` ADD `helmet_grace_seconds` integer DEFAULT 45 NOT NULL;
--> statement-breakpoint
ALTER TABLE `system_settings` ADD `helmet_min_speed_kmh` real DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE `devices` ADD `helmet_worn` integer;
--> statement-breakpoint
ALTER TABLE `devices` ADD `helmet_last_seen_at` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD `helmet_missing_since` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD `helmet_alert_sent_at` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD `helmet_alert_active` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `telemetry` ADD `helmet_worn` integer;
--> statement-breakpoint
CREATE TABLE `helmet_sms_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `school_id` text NOT NULL REFERENCES `schools`(`id`),
  `device_id` text NOT NULL REFERENCES `devices`(`id`) ON DELETE CASCADE,
  `alert_id` text REFERENCES `alerts`(`id`) ON DELETE SET NULL,
  `phone` text NOT NULL,
  `message` text NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `detail` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_helmet_sms_device_status` ON `helmet_sms_jobs` (`device_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_helmet_sms_school_created` ON `helmet_sms_jobs` (`school_id`, `created_at`);
