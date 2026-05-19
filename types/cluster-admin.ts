export type ClusterHealth = 'healthy' | 'warning' | 'critical' | 'unknown'

export type ClusterAttentionSeverity = 'info' | 'warning' | 'critical' | 'blocking'

export type ClusterAttentionCategory =
  | 'connectivity'
  | 'roles'
  | 'cluster_services'
  | 'storage_replication'
  | 'config_sync'
  | 'storage_md'
  | 'config'
  | 'version'

export type ClusterAttentionRecommendedAction =
  | 'reconnect'
  | 'open_cluster_ha'
  | 'sync_config'
  | 'open_raid'
  | 'remove_node'
  | 'add_node'
  | 'run_recovery'
  | 'set_primary'
  | 'none'

export interface ClusterAttentionPoint {
  id: string
  severity: ClusterAttentionSeverity
  category: ClusterAttentionCategory
  title: string
  summary: string
  affectedNodeIds: string[]
  affectedNodeLabels: string[]
  recommendedAction: ClusterAttentionRecommendedAction
  actionRoute?: string
  actionPayload?: Record<string, unknown>
  dismissible: boolean
  source: string
  detectedAt: number
}

export interface ClusterAttentionResponse {
  clusterId: string
  clusterName?: string
  health: ClusterHealth
  attentionPoints: ClusterAttentionPoint[]
  attentionCount: number
  probeError?: string
  scannedAt: number
}

export interface ClusterStorageConsistencyResult {
  clusterId: string
  clusterName?: string
  scannedAt: number
  overall: 'ok' | 'warning' | 'critical' | 'unknown'
  mdSummary: string
  mdArrays: Array<{
    arrayName: string
    okSymmetric: boolean
    okDegraded: boolean
    hardBlockers: string[]
    warnings: string[]
  }>
  nodes: Array<{
    sanId: string
    label: string
    sshReady: boolean
    mdActiveCount: number
    stoppedMdCount: number
    hasMdDetection: boolean
    error?: string
  }>
  scst: {
    checked: boolean
    symmetric: boolean | null
    summary: string
  }
}
