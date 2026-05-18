import { getRuntimeSSHState } from '../../utils/ssh-runtime'
import { getAppVersion } from '../../db/repositories/app-version.repository'

/**
 * Detailed process / DB / SSH aggregate health (Batch 2D).
 * Same disclosure policy as GET /api/admin/app-version — admin and operator only (RBAC).
 * Public minimal liveness remains GET /api/health.
 */
export default defineEventHandler((event) => {
  const { status: sshStatus, configured: sshConfigured } = getRuntimeSSHState()

  let version: string | undefined
  let dbSchemaVersion: number | undefined
  try {
    const stored = getAppVersion()
    version         = stored?.version
    dbSchemaVersion = stored?.dbSchemaVersion
  } catch {
    // DB may not be ready yet
  }

  setResponseStatus(event, 200)

  return {
    status:      'ok',
    ssh:         sshStatus,
    sshConfigured,
    timestamp:   new Date().toISOString(),
    uptime:      process.uptime(),
    version,
    dbSchemaVersion,
  }
})
