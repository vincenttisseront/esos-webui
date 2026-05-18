import { eq } from 'drizzle-orm'
import { readOverview } from '~/server/utils/scst-config-reader'
import { handleSSHError } from '~/server/utils/ssh-error-handler'
import { hasConfiguredSSH, withSanContext } from '~/server/utils/ssh-runtime'
import { resolveScopedSanIdForRead } from '~/server/utils/san-request-context'
import { getDB } from '~/server/db'
import { sans } from '~/server/db/schema'
import type { Overview } from '~/types/esos'
import { createEmptyOverview } from '~/types/esos'

export default defineEventHandler(async (event): Promise<Overview> => {
  if (!hasConfiguredSSH()) {
    return createEmptyOverview()
  }

  const { clusterId } = getQuery(event) as { sanId?: string; clusterId?: string }

  try {
    // Cluster context: resolve the active (primary) node SAN
    if (typeof clusterId === 'string' && clusterId.trim()) {
      const db = getDB()
      const clusterNodes = db.select().from(sans).where(eq(sans.clusterId, clusterId.trim())).all()
      const primary = clusterNodes.find(n => n.clusterRole === 'primary') ?? clusterNodes[0]
      if (!primary) return createEmptyOverview()
      return await withSanContext(primary.id, () => readOverview())
    }

    const scopeId = resolveScopedSanIdForRead(event)
    if (scopeId) return await withSanContext(scopeId, () => readOverview())
    return await readOverview()
  } catch (err) {
    handleSSHError(err)
  }
})
