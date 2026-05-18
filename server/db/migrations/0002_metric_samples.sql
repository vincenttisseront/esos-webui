CREATE TABLE IF NOT EXISTS `metric_samples` (
  `id`          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  `san_id`      TEXT NOT NULL,
  `timestamp`   INTEGER NOT NULL,
  `category`    TEXT NOT NULL,
  `subject`     TEXT NOT NULL,
  `metric_name` TEXT NOT NULL,
  `value`       REAL NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_metrics_lookup`
  ON `metric_samples` (`san_id`, `category`, `subject`, `metric_name`, `timestamp`);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_metrics_timestamp`
  ON `metric_samples` (`timestamp`);
