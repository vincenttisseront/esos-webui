CREATE TABLE `sans` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`driver` text DEFAULT 'iscsi' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `san_ssh_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`san_id` text NOT NULL,
	`auth_type` text NOT NULL,
	`encrypted_key` text,
	`encrypted_password` text,
	`key_fingerprint` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`san_id`) REFERENCES `sans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `san_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`san_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`san_id`) REFERENCES `sans`(`id`) ON UPDATE no action ON DELETE cascade
);
