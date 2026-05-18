-- server/db/migrations/0003_create_app_settings.sql
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'string',
  updated_at TEXT NOT NULL
);
