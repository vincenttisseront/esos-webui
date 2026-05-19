import { eq } from 'drizzle-orm'
import { getDB } from '../../../db'
import { sans } from '../../../db/schema'
import { deleteSan } from '../../../db/repositories/san.repository'
import { getSSHPool } from '../../../utils/ssh-pool'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id requis' })
  }

  const db = getDB()
  const row = db.select().from(sans).where(eq(sans.id, id)).get()
  if (row?.clusterId && row.clusterEnabled) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Ce SAN est membre d\'un cluster. Utilisez « Retirer du cluster » plutôt que supprimer.',
      data: { code: 'CLUSTER_MEMBER', clusterId: row.clusterId },
    })
  }

  await getSSHPool().remove(id)
  const removed = deleteSan(id)
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: 'SAN inconnu' })
  }
  return { ok: true }
})
