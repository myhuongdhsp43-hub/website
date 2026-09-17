ALTER TABLE `schools` ADD `account_token` text;--> statement-breakpoint
ALTER TABLE `devices` ADD `device_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_schools_account_token` ON `schools` (`account_token`);