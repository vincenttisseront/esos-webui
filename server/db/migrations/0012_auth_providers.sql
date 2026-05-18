-- Auth providers (LDAP / OIDC): nullable password for external accounts, external identity, OIDC CSRF/PKCE store
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `users_new` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text,
	`password_hash` text,
	`role` text DEFAULT 'operator' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`session_version` integer DEFAULT 0 NOT NULL,
	`force_password_change` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_login_at` text,
	`created_by` text,
	`auth_source` text DEFAULT 'local' NOT NULL,
	`external_issuer` text,
	`external_subject` text,
	`last_external_login_at` text,
	CHECK (
		(`auth_source` = 'local' AND `password_hash` IS NOT NULL AND `password_hash` != '')
		OR (`auth_source` IN ('ldap', 'oidc'))
	)
);
--> statement-breakpoint
INSERT INTO `users_new` (
	`id`, `username`, `display_name`, `password_hash`, `role`, `active`, `session_version`,
	`force_password_change`, `created_at`, `updated_at`, `last_login_at`, `created_by`,
	`auth_source`, `external_issuer`, `external_subject`, `last_external_login_at`
)
SELECT
	`id`, `username`, `display_name`, `password_hash`, `role`, `active`, `session_version`,
	`force_password_change`, `created_at`, `updated_at`, `last_login_at`, `created_by`,
	'local', NULL, NULL, NULL
FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `users_new` RENAME TO `users`;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_external_identity_unique` ON `users` (`external_issuer`, `external_subject`)
WHERE `external_issuer` IS NOT NULL AND `external_subject` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `oidc_auth_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`state_hash` text NOT NULL,
	`nonce_hash` text NOT NULL,
	`code_verifier_encrypted` text NOT NULL,
	`nonce_encrypted` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE INDEX `oidc_auth_attempts_state_hash_idx` ON `oidc_auth_attempts` (`state_hash`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
