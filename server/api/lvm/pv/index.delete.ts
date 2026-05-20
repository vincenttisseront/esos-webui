import { requireSanIdQuery } from '../../../utils/san-query'
import { requirePreflightOk, invalidateStorageCaches } from '../../../utils/lvm-api-helpers'
import { runPvRemove } from '../../../utils/lvm-actions'
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import type { PvRemovePayload } from '../../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<PvRemovePayload>(event)
  await requirePreflightOk(sanId, { action: 'pvremove', payload: body })
  await withSanContext(sanId, async () => {
    const manager = getActiveSSHManager()
    if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    await runPvRemove(manager, body.path)
    invalidateStorageCaches(sanId)
  })
  return { success: true }
})
