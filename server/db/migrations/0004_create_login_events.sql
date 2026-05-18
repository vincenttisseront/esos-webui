-- server/db/migrations/0004_create_login_events.sql
CREATE TABLE IF NOT EXISTS login_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  success    INTEGER NOT NULL DEFAULT 1,
  ip         TEXT,
  user_agent TEXT,
  at         TEXT NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events (user_id, at);
