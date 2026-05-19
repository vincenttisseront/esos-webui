import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { getDB } from '../../../db'
import { sans, clusters } from '../../../db/schema'
import { resolveClusterMembers } from '../../../utils/cluster-resolve'

/**
 * POST /api/admin/cluster/add-node
 * Attache un SAN autonome à un cluster existant (DB uniquement — corosync manuel).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const body = await readBody<{ clusterId: string; sanId: string; role?: 'primary' | 'secondary' }>(event)
  if (!body.clusterId || !body.sanId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId et sanId requis' })
  }

  const db = getDB()
  const cluster = db.select().from(clusters).where(eq(clusters.id, body.clusterId)).get()
  if (!cluster) {
    throw createError({ statusCode: 404, statusMessage: 'Cluster introuvable' })
  }

  const san = db.select().from(sans).where(eq(sans.id, body.sanId)).get()
  if (!san) {
    throw createError({ statusCode: 404, statusMessage: 'SAN introuvable' })
  }
  if (san.clusterId) {
    throw createError({ statusCode: 409, statusMessage: 'Ce SAN appartient déjà à un cluster' })
  }

  const existing = resolveClusterMembers({ clusterId: body.clusterId })
  const role = body.role ?? 'secondary'
  if (role === 'primary' && existing.some(m => m.clusterRole === 'primary')) {
    throw createError({ statusCode: 409, statusMessage: 'Un nœud primaire existe déjà — utilisez secondaire' })
  }

  const peer = existing[0]?.id ?? null
  const now = new Date().toISOString()

  db.update(sans)
    .set({
      clusterId: body.clusterId,
      clusterEnabled: true,
      clusterRole: role,
      clusterPeer: peer,
      updatedAt: now,
    })
    .where(eq(sans.id, body.sanId))
    .run()

  if (peer) {
    db.update(sans)
      .set({ clusterPeer: body.sanId, updatedAt: now })
      .where(eq(sans.id, peer))
      .run()
  }

  return {
    ok: true,
    clusterId: body.clusterId,
    sanId: body.sanId,
    warnings: [
      'Mettez à jour corosync.conf / nodelist sur tous les nœuds puis synchronisez la configuration.',
    ],
  }
})
