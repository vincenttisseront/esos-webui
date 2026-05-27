import { requireSanIdQuery } from '../../utils/san-query'
import { assertFsWritable, invalidateFsCaches, withFsOverview } from '../../utils/fs-api-helpers'
import { assertFilePathNotEsosProtected } from '../../utils/esos-system-protection'
import { runFsPreflight } from '../../utils/fs-preflight'
import { runBindFileio } from '../../utils/fs-actions'
import {
  mapCreateDeviceError,
  resolveFileioBindConflicts,
  throwFileioBindConflict,
} from '../../utils/fs-fileio-bind-conflicts'
import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import type { CreateFileioPayload, FsNextAction } from '~/types/filesystem'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<CreateFileioPayload>(event)
  assertFsWritable(sanId)

  return withSanContext(sanId, async () => {
    const pre = await withFsOverview(sanId, false, async overview => {
      const manager = getActiveSSHManager()
      if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      const conflict = await resolveFileioBindConflicts(manager, overview, body, sanId)
      if (conflict) throwFileioBindConflict(conflict)
      return runFsPreflight(manager, overview, { action: 'bind_fileio', payload: body }, { sanId })
    })
    if (pre.conflict) throwFileioBindConflict(pre.conflict)
    if (!pre.ok) {
      throw createError({ statusCode: 422, statusMessage: pre.blockers.join(' · ') })
    }
    if (body.confirmation?.trim() !== pre.requiredConfirmation) {
      throw createError({ statusCode: 400, statusMessage: `Confirmation : ${pre.requiredConfirmation}` })
    }

    await withFsOverview(sanId, false, async overview => {
      if (overview.systemProtection) {
        assertFilePathNotEsosProtected(body.vdiskPath.trim(), overview.systemProtection)
      }
    })

    try {
      const { deviceName } = await runBindFileio(body)
      invalidateFsCaches(sanId)
      const nextAction: FsNextAction = {
        route: '/targets',
        query: { exposeDevice: deviceName },
      }
      return { success: true, deviceName, filename: body.vdiskPath, nextAction }
    } catch (err: unknown) {
      const overview = await withFsOverview(sanId, false, async o => o)
      const mapped = mapCreateDeviceError(err, body, overview)
      if (mapped) throwFileioBindConflict(mapped)
      const msg = err instanceof Error ? err.message : 'Erreur SCST'
      throw createError({ statusCode: 422, statusMessage: msg })
    }
  })
})
