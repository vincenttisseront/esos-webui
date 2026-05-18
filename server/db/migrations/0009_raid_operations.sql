-- Migration 0009: RAID Operations (SDD v3.12 §15)
-- Phase 1 uses in-memory store; this schema is ready for Phase 5 persistence.

CREATE TABLE IF NOT EXISTS raid_operations (
  id              TEXT PRIMARY KEY,
  san_id          TEXT NOT NULL,
  backend         TEXT NOT NULL,
  action          TEXT NOT NULL,
  risk_level      TEXT NOT NULL,
  status          TEXT NOT NULL,
  summary         TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  started_at      INTEGER,
  finished_at     INTEGER,
  created_by      TEXT NOT NULL,
  preflight_json  TEXT NOT NULL,
  error           TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS raid_operation_steps (
  id              TEXT PRIMARY KEY,
  operation_id    TEXT NOT NULL REFERENCES raid_operations(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  command         TEXT,
  status          TEXT NOT NULL,
  stdout_preview  TEXT,
  stderr_preview  TEXT,
  started_at      INTEGER,
  finished_at     INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_raid_operations_san_id ON raid_operations(san_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_raid_operations_status ON raid_operations(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_raid_operation_steps_op_id ON raid_operation_steps(operation_id);
