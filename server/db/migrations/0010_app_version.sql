-- Migration 0010: App Version Management (SDD v3.13)
-- Stores the WebUI application version and its history in the local DB.

CREATE TABLE IF NOT EXISTS app_version (
  id               TEXT PRIMARY KEY NOT NULL, -- always 'global'
  version          TEXT NOT NULL,
  build            TEXT,
  git_commit       TEXT,
  git_branch       TEXT,
  build_date       TEXT,
  environment      TEXT,
  db_schema_version INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS app_version_history (
  id                  TEXT PRIMARY KEY NOT NULL,
  version             TEXT NOT NULL,
  previous_version    TEXT,
  build               TEXT,
  previous_build      TEXT,
  git_commit          TEXT,
  previous_git_commit TEXT,
  git_branch          TEXT,
  build_date          TEXT,
  db_schema_version   INTEGER NOT NULL DEFAULT 0,
  applied_at          TEXT NOT NULL,
  source              TEXT NOT NULL, -- 'startup' | 'migration' | 'manual' | 'ci'
  notes               TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_app_version_history_applied_at
  ON app_version_history(applied_at);
