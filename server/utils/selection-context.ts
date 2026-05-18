/**
 * DTOs for GET /api/context/selection — viewer-safe SAN/cluster selection (Batch 2A.1a).
 */

export type SSHLiveStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface SanSelectionDto {
  id: string
  label: string
  status: string
  readOnly: boolean
  clusterId: string | null
  clusterEnabled: boolean
  clusterRole: string | null
  clusterPeer: string | null
}

export interface ClusterNodeSelectionDto {
  id: string
  label: string
  status: string
  clusterRole: string | null
}

export interface ClusterSelectionDto {
  id: string
  name: string
  nodes: ClusterNodeSelectionDto[]
}

export interface SelectionContextResponse {
  sans: SanSelectionDto[]
  clusters: ClusterSelectionDto[]
  sshStatuses: Record<string, SSHLiveStatus>
}

/** Documented allowlist — unit-tested so the selection DTO cannot grow sensitive keys unnoticed. */
export const SAN_SELECTION_DTO_KEYS = [
  'id',
  'label',
  'status',
  'readOnly',
  'clusterId',
  'clusterEnabled',
  'clusterRole',
  'clusterPeer',
] as const

export const CLUSTER_NODE_SELECTION_DTO_KEYS = [
  'id',
  'label',
  'status',
  'clusterRole',
] as const
