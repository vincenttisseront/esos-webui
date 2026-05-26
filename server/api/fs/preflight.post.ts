import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { requireSanIdQuery } from '../../utils/san-query'
import { withFsOverview } from '../../utils/fs-api-helpers'
import { runFsPreflight, type FsPreflightAction } from '../../utils/fs-preflight'
import { throwFileioBindConflict } from '../../utils/fs-fileio-bind-conflicts'
import { assertSanWritable } from '../../utils/san-request-context'

const VALID: FsPreflightAction[] = [
  'create_fs',
  'create_vdisk',
  'bind_fileio',
  'delete_vdisk',
  'unmount',
]

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<{ action: FsPreflightAction; payload: Record<string, unknown>; allowRawDisk?: boolean }>(event)
  if (!body?.action || !VALID.includes(body.action)) {
    throw createError({ statusCode: 400, statusMessage: 'action FS invalide' })
  }

  if (body.action === 'bind_fileio') {
    assertSanWritable(sanId)
  }

  return withSanContext(sanId, async () => {
    return withFsOverview(sanId, false, async overview => {
      const manager = getActiveSSHManager()
      if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      const result = await runFsPreflight(manager, overview, {
        action: body.action,
        payload: body.payload as any,
      }, { allowRawDisk: body.allowRawDisk, sanId })
      if (body.action === 'bind_fileio' && result.conflict) {
        throwFileioBindConflict(result.conflict)
      }
      return result
    })
  })
})
