import { requireSanIdQuery } from '../../../utils/san-query'
import { requirePreflightOk, invalidateStorageCaches, withLvmOverview } from '../../../utils/lvm-api-helpers'
import { runPvCreate } from '../../../utils/lvm-actions'
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import type { PvCreatePayload } from '../../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<PvCreatePayload>(event)
  await requirePreflightOk(sanId, { action: 'pvcreate', payload: body })
  await withSanContext(sanId, async () => {
    const manager = getActiveSSHManager()
    if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    await runPvCreate(manager, body.path, !!body.force)
    invalidateStorageCaches(sanId)
  })
  return { success: true }
})
