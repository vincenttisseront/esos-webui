import { eq } from 'drizzle-orm'
import { getDB } from '../../db'
import { clusters, sans } from '../../db/schema'

export function getClusterById(id: string) {
  return getDB().select().from(clusters).where(eq(clusters.id, id)).get()
}

export function listClusterMembers(clusterId: string) {
  return getDB().select().from(sans).where(eq(sans.clusterId, clusterId)).all()
}

export function countPrimaryNodes(clusterId: string): number {
  return listClusterMembers(clusterId).filter(s => s.clusterRole === 'primary').length
}
