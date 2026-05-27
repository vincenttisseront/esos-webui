-- Migration 0018: Binary deployment catalog and multi-SAN jobs

CREATE TABLE IF NOT EXISTS deployment_binaries (
  id                TEXT PRIMARY KEY NOT NULL,
  name              TEXT NOT NULL,
  version           TEXT,
  filename          TEXT NOT NULL,
  source_path       TEXT,
  stored_path       TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  sha256            TEXT NOT NULL UNIQUE,
  kind              TEXT NOT NULL,
  install_spec_json TEXT NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'registered',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_deployment_binaries_sha256 ON deployment_binaries(sha256);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_deployment_binaries_status ON deployment_binaries(status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS deployment_jobs (
  id            TEXT PRIMARY KEY NOT NULL,
  binary_id     TEXT NOT NULL REFERENCES deployment_binaries(id),
  requested_by  TEXT NOT NULL,
  status        TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_deployment_jobs_binary_id ON deployment_jobs(binary_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_deployment_jobs_status ON deployment_jobs(status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS deployment_job_targets (
  id            TEXT PRIMARY KEY NOT NULL,
  job_id        TEXT NOT NULL REFERENCES deployment_jobs(id) ON DELETE CASCADE,
  san_id        TEXT NOT NULL,
  status        TEXT NOT NULL,
  remote_path   TEXT,
  logs          TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  started_at    TEXT,
  finished_at   TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_deployment_job_targets_job_id ON deployment_job_targets(job_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_deployment_job_targets_san_id ON deployment_job_targets(san_id);
