-- Directory profile fields for provisioned LDAP/OIDC users
ALTER TABLE users ADD COLUMN external_login TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN external_email TEXT;
