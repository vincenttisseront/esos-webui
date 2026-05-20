import { requireSanIdQuery } from '../../../utils/san-query'
import { requirePreflightOk, invalidateStorageCaches } from '../../../utils/lvm-api-helpers'
import { runLvCreate } from '../../../utils/lvm-actions'
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import type { LvCreatePayload } from '../../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<LvCreatePayload>(event)
  await requirePreflightOk(sanId, { action: 'lvcreate', payload: body })
  await withSanContext(sanId, async () => {
    const manager = getActiveSSHManager()
    if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    const result = await runLvCreate(manager, body.vgName, body.name, body.sizeBytes)
    if (result.code !== 0) {
      throw createError({
        statusCode: 500,
        statusMessage: result.stderr.trim() || result.stdout.trim() || `lvcreate a échoué (code ${result.code})`,
      })
    }
    invalidateStorageCaches(sanId)
  })
  return { success: true }
})
