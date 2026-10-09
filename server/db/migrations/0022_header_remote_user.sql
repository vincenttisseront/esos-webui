-- Prefer Bastion/nginx X-Remote-* headers; allow trust without shared token behind private proxy.
UPDATE app_settings SET value = 'X-Remote-User' WHERE key = 'header_auth.user_header' AND value IN ('X-Forwarded-User', '');
--> statement-breakpoint
UPDATE app_settings SET value = 'X-Remote-Email' WHERE key = 'header_auth.email_header' AND value IN ('X-Forwarded-Email', '');
--> statement-breakpoint
UPDATE app_settings SET value = 'X-Remote-Groups' WHERE key = 'header_auth.groups_header' AND value IN ('X-Forwarded-Groups', '');
--> statement-breakpoint
UPDATE app_settings SET value = 'X-Remote-Name' WHERE key = 'header_auth.display_name_header' AND value IN ('X-Forwarded-Preferred-Username', '');
--> statement-breakpoint
INSERT OR IGNORE INTO app_settings (key, value, type) VALUES ('header_auth.require_internal_token', 'false', 'boolean');
