ALTER TABLE `sans` ADD `cluster_enabled` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `sans` ADD `cluster_role` text;
--> statement-breakpoint
ALTER TABLE `sans` ADD `cluster_peer` text;
