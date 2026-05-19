/**
 * Cluster-centric administration types (health + attention points).
 */
import type { ClusterOverview } from './types'

export type ClusterHealth = 'healthy' | 'warning' | 'critical' | 'unknown'

export type ClusterAttentionSeverity = 'info' | 'warning' | 'critical' | 'blocking'

export type ClusterAttentionCategory =
  | 'connectivity'
  | 'roles'
  | 'cluster_services'
  | 'storage_replication'
  | 'config_sync'
  | 'storage_md'
  | 'scst'
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
  source: 'cluster_status' | 'md_detection' | 'scst' | 'config' | 'san_registry' | 'config_sync' | 'version'
  detectedAt: number
}

export interface ClusterAttentionResponse {
  clusterId: string
  clusterName?: string
  health: ClusterHealth
  attentionPoints: ClusterAttentionPoint[]
  attentionCount: number
  overview?: ClusterOverview
  probeError?: string
  scannedAt: number
  storageOverall?: ClusterStorageConsistencyResult['overall']
  storageSummary?: string
}

export interface ClusterMdArrayConsistency {
  arrayName: string
  okSymmetric: boolean
  okDegraded: boolean
  hardBlockers: string[]
  warnings: string[]
}

export interface ClusterStorageConsistencyResult {
  clusterId: string
  clusterName?: string
  scannedAt: number
  overall: 'ok' | 'warning' | 'critical' | 'unknown'
  mdSummary: string
  mdArrays: ClusterMdArrayConsistency[]
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
