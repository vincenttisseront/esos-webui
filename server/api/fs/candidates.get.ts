import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { collectFsBackendCandidates } from '../../utils/fs-candidates'
import { resolveScopedSanIdForRead } from '../../utils/san-request-context'

export default defineEventHandler(async (event) => {
  const { allowRawDisk } = getQuery(event) as { allowRawDisk?: string }
  const scopeId = resolveScopedSanIdForRead(event)
  if (!scopeId) {
    throw createError({ statusCode: 400, statusMessage: 'sanId requis' })
  }
  return withSanContext(scopeId, async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    return collectFsBackendCandidates(manager, {
      allowRawDisk: allowRawDisk === '1',
    })
  })
})
