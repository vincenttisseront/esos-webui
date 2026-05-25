import { eq } from 'drizzle-orm'
import { readOverview } from '~/server/utils/scst-config-reader'
import { handleSSHError } from '~/server/utils/ssh-error-handler'
import { hasConfiguredSSH, withSanContext } from '~/server/utils/ssh-runtime'
import { resolveScopedSanIdForRead } from '~/server/utils/san-request-context'
import { getDB } from '~/server/db'
import { sans } from '~/server/db/schema'
import { createEmptyOverview } from '~/types/esos'
import type { ScstAccessControlOverview } from '~/types/scst-hosts'
import { buildScstAccessControlFromOverview } from '~/utils/scst-access-control'

export default defineEventHandler(async (event): Promise<ScstAccessControlOverview> => {
  if (!hasConfiguredSSH()) {
    return buildScstAccessControlFromOverview(createEmptyOverview())
  }

  const { clusterId } = getQuery(event) as { sanId?: string; clusterId?: string }

  try {
    if (typeof clusterId === 'string' && clusterId.trim()) {
      const db = getDB()
      const clusterNodes = db.select().from(sans).where(eq(sans.clusterId, clusterId.trim())).all()
      const primary = clusterNodes.find(n => n.clusterRole === 'primary') ?? clusterNodes[0]
      if (!primary) {
        return buildScstAccessControlFromOverview(createEmptyOverview())
      }
      const overview = await withSanContext(primary.id, () => readOverview())
      return buildScstAccessControlFromOverview(overview)
    }

    const scopeId = resolveScopedSanIdForRead(event)
    if (scopeId) {
      const overview = await withSanContext(scopeId, () => readOverview())
      return buildScstAccessControlFromOverview(overview)
    }
    const overview = await readOverview()
    return buildScstAccessControlFromOverview(overview)
  } catch (err) {
    handleSSHError(err)
  }
})
