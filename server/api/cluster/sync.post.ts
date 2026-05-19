import { and, eq, inArray } from 'drizzle-orm'
import { getDB } from '../../db'
import { sans } from '../../db/schema'
import { getSSHPool } from '../../utils/ssh-pool'
import { MULTI_CLUSTER_DISAMBIGUATION } from '../../utils/cluster-scope'
import { setSanSetting } from '../../db/repositories/san.repository'

/**
 * POST /api/cluster/sync — Déclenche conf_sync.sh sur le nœud primaire.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ nodeIds?: string[]; clusterId?: string }>(event).catch(() => ({}))
  const db = getDB()

  let primary
  if (body.nodeIds?.length) {
    const candidates = db.select().from(sans).where(inArray(sans.id, body.nodeIds)).all()
    primary = candidates.find(n => n.clusterRole === 'primary') ?? candidates[0]
  } else {
    const clusterIdBody
      = typeof body.clusterId === 'string' && body.clusterId.trim()
        ? body.clusterId.trim()
        : null

    if (clusterIdBody) {
      primary = db
        .select()
        .from(sans)
        .where(
          and(
            eq(sans.clusterId, clusterIdBody),
            eq(sans.clusterEnabled, true),
            eq(sans.clusterRole, 'primary'),
          ),
        )
        .get()
    } else {
      const primaries = db
        .select()
        .from(sans)
        .where(and(eq(sans.clusterEnabled, true), eq(sans.clusterRole, 'primary')))
        .all()

      if (primaries.length > 1) {
        throw createError({ statusCode: 400, statusMessage: MULTI_CLUSTER_DISAMBIGUATION })
      }
      primary = primaries[0]
    }
  }

  if (!primary) {
    throw createError({ statusCode: 404, message: 'Nœud primaire introuvable' })
  }

  if (primary.readOnly) {
    throw createError({ statusCode: 403, message: 'Ce SAN est en lecture seule. Désactivez la protection dans Administration → SANs pour autoriser les modifications.' })
  }

  const pool = getSSHPool()
  const mgr = pool.get(primary.id)

  if (!mgr || mgr.getStatus() !== 'connected') {
    throw createError({ statusCode: 503, message: 'SSH non disponible sur le nœud primaire' })
  }

  const result = await mgr.exec('PATH=/usr/local/sbin:/usr/local/bin:/sbin:/usr/sbin:/bin:/usr/bin conf_sync.sh 2>&1', 60_000)
  const output = result.stdout.trim() || result.stderr.trim()

  if (result.code !== 0) {
    throw createError({
      statusCode: 500,
      message: output || `conf_sync.sh a échoué (code ${result.code})`,
    })
  }

  setSanSetting(primary.id, 'cluster_last_sync_at', String(Date.now()))

  return { ok: true, output }
})
