import { createError } from 'h3'

/** Same disambiguation message as Batch 2B.2 sanId policy (English). */
export const MULTI_CLUSTER_DISAMBIGUATION =
  'clusterId or nodeIds is required when multiple clusters are configured'

export type ClusterIdCarrier = { clusterId: string | null }

export function distinctClusterIds(rows: ClusterIdCarrier[]): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    if (r.clusterId) set.add(r.clusterId)
  }
  return [...set]
}

/**
 * When `GET /api/cluster/status` is called without `nodeIds` or `clusterId`,
 * reject implicit candidate sets that mix several clusters or several undecorated SAN rows.
 */
export function assertImplicitClusterCandidatesAllowed(candidates: ClusterIdCarrier[]): void {
  if (candidates.length === 0) return
  const distinct = distinctClusterIds(candidates)
  if (distinct.length > 1) {
    throw createError({ statusCode: 400, statusMessage: MULTI_CLUSTER_DISAMBIGUATION })
  }
  if (distinct.length === 0 && candidates.length > 1) {
    throw createError({ statusCode: 400, statusMessage: MULTI_CLUSTER_DISAMBIGUATION })
  }
}
