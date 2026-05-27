-- Migration 0019: deployment job scope (single_san | multi_san)

ALTER TABLE deployment_jobs ADD COLUMN scope TEXT NOT NULL DEFAULT 'multi_san';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_deployment_job_targets_san_status
  ON deployment_job_targets(san_id, status);
