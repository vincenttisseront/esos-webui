import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { getDB } from '../../../../db'
import { sans } from '../../../../db/schema'
import { resolveClusterMembers } from '../../../../utils/cluster-resolve'
import { buildClusterStorageConsistency } from '../../../../utils/cluster-storage-consistency'

/**
 * GET /api/admin/cluster/remove-node/preflight?clusterId=&nodeId=
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }

  const query = getQuery(event)
  const clusterId = typeof query.clusterId === 'string' ? query.clusterId.trim() : ''
  const nodeId = typeof query.nodeId === 'string' ? query.nodeId.trim() : ''
  if (!clusterId || !nodeId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId et nodeId requis' })
  }

  const db = getDB()
  const node = db.select().from(sans).where(eq(sans.id, nodeId)).get()
  if (!node || node.clusterId !== clusterId) {
    throw createError({ statusCode: 404, statusMessage: 'Nœud introuvable dans ce cluster' })
  }

  const members = resolveClusterMembers({ clusterId })
  const remaining = members.filter(m => m.id !== nodeId)
  const warnings: string[] = []
  const blockers: string[] = []

  if (node.clusterRole === 'primary' && remaining.length > 0) {
    const hasSecondary = remaining.some(m => m.clusterRole === 'secondary')
    if (hasSecondary) {
      warnings.push('Retrait du nœud primaire — promouvez un secondaire ou confirmez la dissolution.')
    }
  }

  if (remaining.length === 0) {
    warnings.push('Dernier nœud — le cluster sera dissous en base.')
  } else if (remaining.length === 1) {
    warnings.push('Un seul nœud restera — le cluster sera dissous et le nœud redeviendra autonome.')
  }

  try {
    const storage = await buildClusterStorageConsistency(clusterId)
    if (storage.overall === 'critical') {
      blockers.push('Incohérence stockage MD critique — résolvez avant de retirer un nœud.')
    } else if (storage.overall === 'warning') {
      warnings.push('Stockage MD non symétrique — vérifiez après retrait.')
    }
  } catch {
    warnings.push('Évaluation stockage impossible — procédez avec prudence.')
  }

  const ok = blockers.length === 0
  return {
    ok,
    clusterId,
    nodeId,
    nodeLabel: node.label,
    isPrimary: node.clusterRole === 'primary',
    remainingCount: remaining.length,
    warnings,
    blockers,
  }
})
