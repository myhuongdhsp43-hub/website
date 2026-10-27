-- Preserve all existing devices while allowing the same human-readable device
-- ID (for example XE001) to be used by separate schools. Authentication must
-- always include the per-device token hash; the ID alone is never authority.
DROP INDEX IF EXISTS uq_devices_device_id;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_school_device_id
  ON devices (school_id, device_id);
