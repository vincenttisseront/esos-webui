import { requireSanIdQuery } from '../../utils/san-query'
import { assertFsWritable, invalidateFsCaches, withFsOverview } from '../../utils/fs-api-helpers'
import { runFsPreflight } from '../../utils/fs-preflight'
import { runDeleteVdisk } from '../../utils/fs-actions'
import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<{ path: string; confirmation?: string }>(event)
  assertFsWritable(sanId)

  return withSanContext(sanId, async () => {
    const pre = await withFsOverview(sanId, false, async overview => {
      const manager = getActiveSSHManager()
      if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      return runFsPreflight(manager, overview, { action: 'delete_vdisk', payload: body })
    })
    if (!pre.ok) throw createError({ statusCode: 422, statusMessage: pre.blockers.join(' · ') })
    if (body.confirmation?.trim() !== pre.requiredConfirmation) {
      throw createError({ statusCode: 400, statusMessage: `Confirmation : ${pre.requiredConfirmation}` })
    }
    const manager = getActiveSSHManager()
    if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    await runDeleteVdisk(manager, body.path)
    invalidateFsCaches(sanId)
    return { success: true }
  })
})
