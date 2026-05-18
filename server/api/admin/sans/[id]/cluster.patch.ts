import { eq } from 'drizzle-orm'
import { getDB } from '../../../../db'
import { sans } from '../../../../db/schema'

interface ClusterBody {
  clusterEnabled: boolean
  clusterRole?:   'primary' | 'secondary' | null
  clusterPeer?:   string | null
  clusterId?:     string | null
}

/**
 * PATCH /api/admin/sans/:id/cluster — Met à jour les paramètres cluster d'un SAN.
 */
export default defineEventHandler(async (event) => {
  const id   = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'id manquant' })

  const body = await readBody<ClusterBody>(event)

  const db  = getDB()
  const now = new Date().toISOString()

  const result = db.update(sans)
    .set({
      clusterEnabled: body.clusterEnabled,
      clusterRole:    body.clusterRole ?? null,
      clusterPeer:    body.clusterPeer ?? null,
      clusterId:      body.clusterId   ?? null,
      updatedAt:      now,
    })
    .where(eq(sans.id, id))
    .run()

  if (result.changes === 0) {
    throw createError({ statusCode: 404, message: 'SAN introuvable' })
  }

  return { ok: true }
})
