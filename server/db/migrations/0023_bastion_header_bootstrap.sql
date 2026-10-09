-- Enable Bastion header SSO + JIT on existing deployments (no Admin UI).
UPDATE app_settings SET value = 'true' WHERE key = 'header_auth.enabled';
--> statement-breakpoint
UPDATE app_settings SET value = 'false' WHERE key = 'header_auth.require_internal_token';
--> statement-breakpoint
UPDATE app_settings SET value = 'X-Remote-User' WHERE key = 'header_auth.user_header';
--> statement-breakpoint
UPDATE app_settings SET value = 'X-Remote-Email' WHERE key = 'header_auth.email_header';
--> statement-breakpoint
UPDATE app_settings SET value = 'X-Remote-Groups' WHERE key = 'header_auth.groups_header';
--> statement-breakpoint
UPDATE app_settings SET value = 'X-Remote-Name' WHERE key = 'header_auth.display_name_header';
--> statement-breakpoint
UPDATE app_settings SET value = 'bastion-pro' WHERE key = 'header_auth.issuer';
--> statement-breakpoint
UPDATE app_settings SET value = 'true' WHERE key = 'auth.jit.enabled';
--> statement-breakpoint
INSERT OR IGNORE INTO app_settings (key, value, type) VALUES ('header_auth.enabled', 'true', 'boolean');
--> statement-breakpoint
INSERT OR IGNORE INTO app_settings (key, value, type) VALUES ('header_auth.require_internal_token', 'false', 'boolean');
--> statement-breakpoint
INSERT OR IGNORE INTO app_settings (key, value, type) VALUES ('header_auth.user_header', 'X-Remote-User', 'string');
--> statement-breakpoint
INSERT OR IGNORE INTO app_settings (key, value, type) VALUES ('auth.jit.enabled', 'true', 'boolean');
