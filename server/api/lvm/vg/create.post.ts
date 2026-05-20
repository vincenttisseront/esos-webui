import { requireSanIdQuery } from '../../../utils/san-query'
import { requirePreflightOk, invalidateStorageCaches } from '../../../utils/lvm-api-helpers'
import { runVgCreate } from '../../../utils/lvm-actions'
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import type { VgCreatePayload } from '../../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<VgCreatePayload>(event)
  await requirePreflightOk(sanId, { action: 'vgcreate', payload: body })
  await withSanContext(sanId, async () => {
    const manager = getActiveSSHManager()
    if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    await runVgCreate(manager, body.name, body.pvPaths)
    invalidateStorageCaches(sanId)
  })
  return { success: true }
})
