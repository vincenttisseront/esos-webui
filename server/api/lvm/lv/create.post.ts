import { requireSanIdQuery } from '../../../utils/san-query'
import { requirePreflightOk, invalidateStorageCaches } from '../../../utils/lvm-api-helpers'
import { runLvCreate } from '../../../utils/lvm-actions'
import { collectLvmOverviewLite } from '../../../utils/lvm-overview.service'
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import { overviewHasLv } from '../../../../utils/lvm-lv-size'
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
    const lite = await collectLvmOverviewLite(manager)
    if (!overviewHasLv(lite.lvs, body.vgName, body.name)) {
      throw createError({
        statusCode: 500,
        statusMessage: `LV ${body.vgName}/${body.name} absent après lvcreate (lvs)`,
      })
    }
    invalidateStorageCaches(sanId)
  })
  return { success: true }
})
