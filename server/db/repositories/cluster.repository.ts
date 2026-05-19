import { eq } from 'drizzle-orm'
import { getDB } from '../../db'
import { clusterNodes, clusters, sans } from '../../db/schema'

export function getClusterById(id: string) {
  return getDB().select().from(clusters).where(eq(clusters.id, id)).get()
}

export function listClusterMembers(clusterId: string) {
  return getDB().select().from(sans).where(eq(sans.clusterId, clusterId)).all()
}

export function countPrimaryNodes(clusterId: string): number {
  return listClusterMembers(clusterId).filter(s => s.clusterRole === 'primary').length
}

/** Sync cluster_nodes from sans rows (best-effort, N-node registry). */
export function syncClusterNodesFromSans(clusterId: string): void {
  const db = getDB()
  const members = listClusterMembers(clusterId)
  db.delete(clusterNodes).where(eq(clusterNodes.clusterId, clusterId)).run()
  members.forEach((m, idx) => {
    db.insert(clusterNodes)
      .values({
        clusterId,
        sanId: m.id,
        role: m.clusterRole,
        sortOrder: idx,
      })
      .run()
  })
}

export function listClusterNodesOrdered(clusterId: string) {
  const db = getDB()
  return db
    .select()
    .from(clusterNodes)
    .where(eq(clusterNodes.clusterId, clusterId))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder)
}
