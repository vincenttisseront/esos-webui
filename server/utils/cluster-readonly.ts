import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getDB } from '../db'
import { sans } from '../db/schema'
import { SAN_READONLY_CODE } from './san-request-context'

export function resolveClusterEnabledNodes(clusterId: string) {
  return getDB()
    .select({ id: sans.id, label: sans.label, readOnly: sans.readOnly })
    .from(sans)
    .where(and(eq(sans.clusterId, clusterId), eq(sans.clusterEnabled, true)))
    .all()
}

/** Fail the whole cluster operation if any enabled member is read-only. */
export function assertClusterNodesWritable(clusterId: string): void {
  const readOnlyNodes = resolveClusterEnabledNodes(clusterId).filter(n => n.readOnly)
  if (readOnlyNodes.length) {
    throw createError({
      statusCode: 403,
      statusMessage: 'SAN is read-only',
      data: {
        code: SAN_READONLY_CODE,
        nodes: readOnlyNodes.map(n => ({ sanId: n.id, label: n.label })),
      },
    })
  }
}
