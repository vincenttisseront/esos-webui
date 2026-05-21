import { getSSHPool } from '../../../../utils/ssh-pool'
import { assertSanWritable } from '../../../../utils/san-request-context'
import {
  deleteUpgradePackageStatus,
  getUpgradePackageStatus,
  getUpgradePackageStatusBySan,
} from '../../../../utils/upgrade-package-store'
import { shellSingleQuoteForRemote } from '../../../../utils/remote-config-paths'

/**
 * DELETE /api/admin/upgrade/package?sanId= | ?stagingId=
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event) as { sanId?: string; stagingId?: string }

  const status = query.stagingId
    ? getUpgradePackageStatus(String(query.stagingId))
    : query.sanId
      ? getUpgradePackageStatusBySan(String(query.sanId))
      : undefined

  if (!status?.sanId) {
    throw createError({ statusCode: 404, message: 'Aucun paquet en staging' })
  }

  assertSanWritable(status.sanId)

  const pool = getSSHPool()
  const mgr = pool.get(status.sanId)
  if (mgr?.getStatus() === 'connected') {
    const paths = [status.remoteArchivePath, status.stagingDir].filter(Boolean) as string[]
    for (const p of paths) {
      const q = shellSingleQuoteForRemote(p)
      await mgr.exec(`rm -rf ${q}`, 30_000).catch(() => {})
    }
  }

  deleteUpgradePackageStatus(status.stagingId)
  return { ok: true }
})
