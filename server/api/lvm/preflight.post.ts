import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { requireSanIdQuery } from '../../utils/san-query'
import { withLvmOverview } from '../../utils/lvm-api-helpers'
import { runLvmPreflight } from '../../utils/lvm-preflight'
import type { LvmPreflightRequest } from '../../utils/lvm-types'

const VALID = ['pvcreate', 'vgcreate', 'lvcreate', 'pvremove', 'vgremove', 'lvremove', 'bind_scst'] as const

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<LvmPreflightRequest>(event)
  if (!body?.action || !VALID.includes(body.action as any)) {
    throw createError({ statusCode: 400, statusMessage: 'action LVM invalide' })
  }

  return withSanContext(sanId, async () => {
    return withLvmOverview(sanId, false, async (overview) => {
      const manager = getActiveSSHManager()
      if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      return runLvmPreflight(manager, body, overview)
    })
  })
})
