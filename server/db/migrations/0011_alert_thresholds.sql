-- Migration 0011: Global alert thresholds + session grace state
CREATE TABLE IF NOT EXISTS alert_session_state (
  san_id               TEXT NOT NULL,
  dedupe_key           TEXT NOT NULL,
  first_violation_at   INTEGER NOT NULL,
  PRIMARY KEY (san_id, dedupe_key)
);
--> statement-breakpoint
INSERT OR IGNORE INTO app_settings (key, value, type, updated_at) VALUES
('alerts.volume_warn_pct', '75', 'number', (datetime('now'))),
('alerts.volume_critical_pct', '90', 'number', (datetime('now'))),
('alerts.session_enabled', 'true', 'boolean', (datetime('now'))),
('alerts.session_policy', 'strict', 'string', (datetime('now'))),
('alerts.session_grace_sec', '120', 'number', (datetime('now'))),
('alerts.session_min_active', '1', 'number', (datetime('now'))),
('alerts.fc_port_enabled', 'true', 'boolean', (datetime('now')));
