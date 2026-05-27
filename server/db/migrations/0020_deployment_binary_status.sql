-- Migration 0020: normalize deployment binary status values

UPDATE deployment_binaries SET status = 'available' WHERE status = 'registered';
--> statement-breakpoint
UPDATE deployment_binaries SET status = 'disabled' WHERE status = 'archived';
