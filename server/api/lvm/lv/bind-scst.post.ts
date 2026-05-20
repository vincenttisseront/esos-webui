import { requireSanIdQuery } from '../../../utils/san-query'
import { requirePreflightOk, invalidateStorageCaches, withLvmOverview } from '../../../utils/lvm-api-helpers'
import { createDevice } from '../../../utils/scst-config-writer'
import { withSanContext } from '../../../utils/ssh-runtime'
import type { BindScstPayload } from '../../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<BindScstPayload>(event)
  await requirePreflightOk(sanId, { action: 'bind_scst', payload: body })

  await withSanContext(sanId, async () => {
    const lvPath = await withLvmOverview(sanId, false, async (overview) => {
      const lv = overview.lvs.find(l => l.vgName === body.vgName && l.name === body.lvName)
      if (!lv) throw createError({ statusCode: 422, statusMessage: 'LV introuvable' })
      return lv.path
    })
    try {
      await createDevice('vdisk_blockio', body.deviceName, lvPath)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur SCST'
      throw createError({ statusCode: 422, statusMessage: msg })
    }
    invalidateStorageCaches(sanId)
  })
  return { success: true, deviceName: body.deviceName, filename: body.vgName ? `/dev/${body.vgName}/${body.lvName}` : undefined }
})
