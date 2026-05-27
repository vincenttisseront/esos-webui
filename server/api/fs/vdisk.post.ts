import { requireSanIdQuery } from '../../utils/san-query'
import { assertFsWritable, invalidateFsCaches, withFsOverview } from '../../utils/fs-api-helpers'
import { assertMountPointNotEsosProtected } from '../../utils/esos-system-protection'
import { runFsPreflight } from '../../utils/fs-preflight'
import { runCreateVdisk } from '../../utils/fs-actions'
import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import type { CreateVdiskPayload } from '~/types/filesystem'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<CreateVdiskPayload>(event)
  assertFsWritable(sanId)

  return withSanContext(sanId, async () => {
    const pre = await withFsOverview(sanId, false, async overview => {
      const manager = getActiveSSHManager()
      if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      return runFsPreflight(manager, overview, { action: 'create_vdisk', payload: body })
    })
    if (!pre.ok) {
      throw createError({ statusCode: 422, statusMessage: pre.blockers.join(' · ') })
    }
    if (body.confirmation?.trim() !== pre.requiredConfirmation) {
      throw createError({ statusCode: 400, statusMessage: `Confirmation : ${pre.requiredConfirmation}` })
    }
    return withFsOverview(sanId, false, async overview => {
      if (overview.systemProtection) {
        assertMountPointNotEsosProtected(body.mountPoint, overview.systemProtection)
      }
      const manager = getActiveSSHManager()
      if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      const result = await runCreateVdisk(manager, body)
      invalidateFsCaches(sanId)
      return { success: true, ...result }
    })
  })
})
