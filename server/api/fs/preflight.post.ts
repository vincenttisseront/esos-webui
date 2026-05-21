import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { requireSanIdQuery } from '../../utils/san-query'
import { withFsOverview } from '../../utils/fs-api-helpers'
import { runFsPreflight, type FsPreflightAction } from '../../utils/fs-preflight'

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

  return withSanContext(sanId, async () => {
    return withFsOverview(sanId, false, async overview => {
      const manager = getActiveSSHManager()
      if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      return runFsPreflight(manager, overview, {
        action: body.action,
        payload: body.payload as any,
      }, { allowRawDisk: body.allowRawDisk })
    })
  })
})
