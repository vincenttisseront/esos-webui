-- LDAP test / login / provisioning audit trail (no secrets).
CREATE TABLE IF NOT EXISTS ldap_auth_events (
  id                  TEXT PRIMARY KEY NOT NULL,
  at                  TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  action              TEXT NOT NULL,
  step                TEXT NOT NULL,
  result              TEXT NOT NULL,
  safe_code           TEXT,
  username            TEXT,
  provider            TEXT NOT NULL DEFAULT 'ldap',
  url_host            TEXT,
  base_dn             TEXT,
  rendered_filter     TEXT,
  ldap_error_name     TEXT,
  ldap_error_code     TEXT,
  diagnostic_message  TEXT,
  matched_dn          TEXT,
  referrals_json      TEXT,
  duration_ms         INTEGER,
  request_ip          TEXT,
  user_agent          TEXT,
  step_results_json   TEXT
);

CREATE INDEX IF NOT EXISTS idx_ldap_auth_events_at ON ldap_auth_events(at DESC);
CREATE INDEX IF NOT EXISTS idx_ldap_auth_events_type ON ldap_auth_events(event_type);
