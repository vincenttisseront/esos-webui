import type { ClusterHealth, ClusterAttentionPoint } from './cluster-admin-types'
import type { ClusterStorageConsistencyResult } from './cluster-admin-types'

const HEALTH_RANK: Record<ClusterHealth, number> = {
  healthy: 0,
  warning: 1,
  critical: 2,
  unknown: 3,
}

export function storageOverallToHealth(
  overall: ClusterStorageConsistencyResult['overall'],
): ClusterHealth {
  switch (overall) {
    case 'ok':
      return 'healthy'
    case 'warning':
      return 'warning'
    case 'critical':
      return 'critical'
    default:
      return 'unknown'
  }
}

export function mergeClusterHealth(
  attentionHealth: ClusterHealth,
  storageHealth: ClusterHealth,
  probeSucceeded: boolean,
): ClusterHealth {
  if (!probeSucceeded) return 'unknown'
  const a = HEALTH_RANK[attentionHealth] ?? 0
  const s = HEALTH_RANK[storageHealth] ?? 0
  const max = Math.max(a, s)
  if (max === 0) return 'healthy'
  if (max === 1) return 'warning'
  if (max === 2) return 'critical'
  return 'unknown'
}

export function deriveClusterHealth(
  attentionPoints: ClusterAttentionPoint[],
  probeSucceeded: boolean,
): ClusterHealth {
  if (!probeSucceeded) return 'unknown'
  const actionable = attentionPoints.filter(p => p.severity !== 'info')
  if (actionable.length === 0) return 'healthy'
  if (actionable.some(p => p.severity === 'blocking' || p.severity === 'critical')) return 'critical'
  return 'warning'
}
