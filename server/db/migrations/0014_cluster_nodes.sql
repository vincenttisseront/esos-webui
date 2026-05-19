-- N-node cluster membership (optional; sans.cluster_peer retained for 2-node compat)
CREATE TABLE IF NOT EXISTS cluster_nodes (
  cluster_id TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  san_id TEXT NOT NULL REFERENCES sans(id) ON DELETE CASCADE,
  role TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cluster_id, san_id)
);

CREATE INDEX IF NOT EXISTS idx_cluster_nodes_san ON cluster_nodes(san_id);
