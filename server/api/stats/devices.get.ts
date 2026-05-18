import { readDeviceSnapshots } from '../../utils/io-stats-reader'
import { pushDeviceSnapshots } from '../../utils/metrics-store'
import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { defaultStatsBucketSanId, resolveScopedSanIdForRead } from '../../utils/san-request-context'

export default defineEventHandler(async (event) => {
  const scopeId = resolveScopedSanIdForRead(event)
  const bucketId = scopeId ?? defaultStatsBucketSanId()

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager.isReady()) {
      setResponseStatus(event, 503)
      return { error: 'SSH non disponible' }
    }
    try {
      const snapshots = await readDeviceSnapshots()
      const throughputs = pushDeviceSnapshots(snapshots, bucketId)
      return { devices: throughputs, capturedAt: Date.now() }
    } catch {
      setResponseStatus(event, 503)
      return { error: 'SSH non disponible' }
    }
  }

  if (scopeId) return await withSanContext(scopeId, run)
  return await run()
})
