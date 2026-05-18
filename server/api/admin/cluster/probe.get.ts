/**
 * GET /api/admin/cluster/probe?nodeId=xxx
 * Retourne la sortie brute du script de probe SSH pour diagnostiquer les parsers.
 * Réservé admin.
 */
import { getSSHPool } from '../../../utils/ssh-pool'
import { PROBE_CMD } from '../../../utils/cluster-reader'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') throw createError({ statusCode: 403, message: 'Forbidden' })

  const query  = getQuery(event)
  const nodeId = String(query.nodeId ?? '')
  if (!nodeId) throw createError({ statusCode: 400, message: 'nodeId requis' })

  const pool = getSSHPool()
  const mgr  = pool.get(nodeId)

  if (!mgr || mgr.getStatus() !== 'connected') {
    return { ok: false, error: 'SSH non connecté', nodeId }
  }

  try {
    const result = await mgr.exec(PROBE_CMD, 30_000)
    return { ok: true, nodeId, stdout: result.stdout, stderr: result.stderr ?? '' }
  } catch (err: any) {
    return { ok: false, nodeId, error: String(err?.message ?? err) }
  }
})
