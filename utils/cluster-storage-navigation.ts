/** Query params for admin storage pages opened from an HA cluster card. */
export function clusterStorageQuery(clusterId: string): Record<string, string> {
  return { scope: 'cluster', clusterId }
}

export function isClusterStorageScope(
  query: Record<string, unknown>,
): { clusterId: string } | null {
  const scope = Array.isArray(query.scope) ? query.scope[0] : query.scope
  const clusterId = Array.isArray(query.clusterId) ? query.clusterId[0] : query.clusterId
  if (scope === 'cluster' && typeof clusterId === 'string' && clusterId.trim()) {
    return { clusterId: clusterId.trim() }
  }
  return null
}
