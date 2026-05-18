CREATE TABLE `clusters` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sans` ADD `cluster_id` text REFERENCES `clusters`(`id`);
