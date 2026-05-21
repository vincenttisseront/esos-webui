import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { getDB } from '../../../db'
import { sans } from '../../../db/schema'
import { resolveClusterMembers } from '../../../utils/cluster-resolve'

/**
 * POST /api/admin/cluster/promote-primary
 * Body: { clusterId, nodeId }
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden', data: { code: 'rbac.forbidden' } })
  }

  const body = await readBody<{ clusterId: string; nodeId: string }>(event)
  if (!body.clusterId || !body.nodeId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId et nodeId requis' })
  }

  const members = resolveClusterMembers({ clusterId: body.clusterId })
  const target = members.find(m => m.id === body.nodeId)
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Nœud introuvable dans ce cluster' })
  }

  const db = getDB()
  const now = new Date().toISOString()

  for (const m of members) {
    const role = m.id === body.nodeId ? 'primary' : 'secondary'
    db.update(sans)
      .set({ clusterRole: role, updatedAt: now })
      .where(eq(sans.id, m.id))
      .run()
  }

  const secondaries = members.filter(m => m.id !== body.nodeId)
  if (secondaries[0]) {
    db.update(sans)
      .set({ clusterPeer: secondaries[0].id, updatedAt: now })
      .where(eq(sans.id, body.nodeId))
      .run()
    for (const s of secondaries) {
      db.update(sans)
        .set({ clusterPeer: body.nodeId, updatedAt: now })
        .where(eq(sans.id, s.id))
        .run()
    }
  }

  return { ok: true, clusterId: body.clusterId, primaryId: body.nodeId }
})
