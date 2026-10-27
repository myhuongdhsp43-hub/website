ALTER TABLE devices ADD COLUMN verify_code text;
--> statement-breakpoint
ALTER TABLE devices ADD COLUMN pairing_pending integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE devices ADD COLUMN pairing_requested_at text;
--> statement-breakpoint
ALTER TABLE devices ADD COLUMN paired_at text;
