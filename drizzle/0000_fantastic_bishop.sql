CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`device_id` text,
	`student_id` text,
	`event_id` text,
	`type` text NOT NULL,
	`severity` text DEFAULT 'warning' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_at` text,
	`resolved_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `overspeed_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_alerts_school_status_created` ON `alerts` (`school_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_school_created_at` ON `audit_logs` (`school_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `device_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`speed_limit` real DEFAULT 40 NOT NULL,
	`speed_alert_enabled` integer DEFAULT true NOT NULL,
	`buzzer_enabled` integer DEFAULT true NOT NULL,
	`remote_alarm` integer DEFAULT false NOT NULL,
	`remote_alarm_requested_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_device_configs_device_id` ON `device_configs` (`device_id`);--> statement-breakpoint
CREATE TABLE `device_request_limits` (
	`device_id` text PRIMARY KEY NOT NULL,
	`window_started_at` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`student_id` text,
	`device_id` text NOT NULL,
	`device_name` text NOT NULL,
	`device_token_hash` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_seen` text,
	`last_latitude` real,
	`last_longitude` real,
	`current_speed` real,
	`satellites` integer,
	`hdop` real,
	`network_signal` integer,
	`firmware_version` text,
	`gps_valid` integer DEFAULT false NOT NULL,
	`last_telemetry_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_devices_device_id` ON `devices` (`device_id`);--> statement-breakpoint
CREATE INDEX `idx_devices_school_seen` ON `devices` (`school_id`,`last_seen`);--> statement-breakpoint
CREATE INDEX `idx_devices_student_id` ON `devices` (`student_id`);--> statement-breakpoint
CREATE TABLE `overspeed_events` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text,
	`device_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`speed_limit` real NOT NULL,
	`max_speed` real NOT NULL,
	`latitude` real,
	`longitude` real,
	`gps_valid` integer DEFAULT false NOT NULL,
	`sms_sent` integer DEFAULT false NOT NULL,
	`acknowledged_at` text,
	`acknowledged_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_overspeed_events_device_active` ON `overspeed_events` (`device_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `idx_overspeed_events_student_started` ON `overspeed_events` (`student_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `parent_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`name` text NOT NULL,
	`relationship` text NOT NULL,
	`phone` text NOT NULL,
	`sms_enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_parent_contacts_student_id` ON `parent_contacts` (`student_id`);--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`timezone` text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sms_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text,
	`phone` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`provider` text NOT NULL,
	`provider_message_id` text,
	`error_message` text,
	`sent_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `overspeed_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sms_logs_event_id` ON `sms_logs` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_sms_logs_created_at` ON `sms_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`student_code` text NOT NULL,
	`full_name` text NOT NULL,
	`class_name` text NOT NULL,
	`grade` text,
	`academic_year` text,
	`active` integer DEFAULT true NOT NULL,
	`vehicle_plate` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_students_school_code` ON `students` (`school_id`,`student_code`);--> statement-breakpoint
CREATE INDEX `idx_students_school_name` ON `students` (`school_id`,`full_name`);--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text NOT NULL,
	`sms_enabled` integer DEFAULT true NOT NULL,
	`send_location` integer DEFAULT true NOT NULL,
	`sms_cooldown_minutes` integer DEFAULT 15 NOT NULL,
	`sms_template` text NOT NULL,
	`telemetry_retention_days` integer DEFAULT 90 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_system_settings_school_id` ON `system_settings` (`school_id`);--> statement-breakpoint
CREATE TABLE `telemetry` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`recorded_at` text NOT NULL,
	`received_at` text NOT NULL,
	`sample_id` text,
	`speed` real,
	`latitude` real,
	`longitude` real,
	`gps_valid` integer NOT NULL,
	`satellites` integer,
	`hdop` real,
	`network_signal` integer,
	`overspeed_active` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_telemetry_sample_id` ON `telemetry` (`device_id`,`sample_id`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_device_recorded_at` ON `telemetry` (`device_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_received_at` ON `telemetry` (`received_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`school_id` text,
	`platform_user_id` text NOT NULL,
	`email` text NOT NULL,
	`full_name` text,
	`role` text DEFAULT 'staff' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_platform_user_id` ON `users` (`platform_user_id`);--> statement-breakpoint
CREATE INDEX `idx_users_school_id` ON `users` (`school_id`);