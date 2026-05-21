import { requireSanIdQuery } from '../../utils/san-query'
import { assertFsWritable, invalidateFsCaches, withFsOverview } from '../../utils/fs-api-helpers'
import { runFsPreflight } from '../../utils/fs-preflight'
import { runCreateFilesystem } from '../../utils/fs-actions'
import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import type { CreateFsPayload } from '~/types/filesystem'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<CreateFsPayload>(event)
  assertFsWritable(sanId)

  return withSanContext(sanId, async () => {
    const pre = await withFsOverview(sanId, false, async overview => {
      const manager = getActiveSSHManager()
      if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      return runFsPreflight(manager, overview, { action: 'create_fs', payload: body })
    })
    if (!pre.ok) {
      throw createError({ statusCode: 422, statusMessage: pre.blockers.join(' · '), data: { preflight: pre } })
    }
    if (body.confirmation?.trim() !== pre.requiredConfirmation) {
      throw createError({ statusCode: 400, statusMessage: `Confirmation requise : ${pre.requiredConfirmation}` })
    }
    const manager = getActiveSSHManager()
    if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    const result = await runCreateFilesystem(manager, body)
    invalidateFsCaches(sanId)
    return { success: true, ...result }
  })
})
