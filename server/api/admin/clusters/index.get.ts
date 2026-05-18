import { eq } from 'drizzle-orm'
import { getDB } from '../../../db'
import { clusters, sans } from '../../../db/schema'

export interface ClusterWithNodes {
  id:        string
  name:      string
  createdAt: string
  nodes: {
    id:          string
    label:       string
    host:        string
    status:      string
    clusterRole: string | null
  }[]
}

/**
 * GET /api/admin/clusters — Liste tous les clusters avec leurs nœuds.
 */
export default defineEventHandler(async (): Promise<ClusterWithNodes[]> => {
  const db      = getDB()
  const all     = db.select().from(clusters).all()
  const allSans = db.select().from(sans).all()

  return all.map(c => ({
    id:        c.id,
    name:      c.name,
    createdAt: c.createdAt,
    nodes: allSans
      .filter(s => s.clusterId === c.id)
      .map(s => ({
        id:          s.id,
        label:       s.label,
        host:        s.host,
        status:      s.status,
        clusterRole: s.clusterRole,
      })),
  }))
})
