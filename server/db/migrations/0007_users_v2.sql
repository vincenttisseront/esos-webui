-- SDD v3.7 : gestion multi-utilisateurs avec rôles, activation et invalidation de session
ALTER TABLE users ADD COLUMN display_name    TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN active          INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN created_by      TEXT;
