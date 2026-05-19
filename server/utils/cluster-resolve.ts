import { and, eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import { getDB } from '../db'
import { sans } from '../db/schema'

export interface ClusterSanMember {
  id: string
  label: string
  host: string
  port: number
  status: string
  readOnly: boolean
  clusterEnabled: boolean
  clusterRole: string | null
  clusterId: string | null
  clusterPeer: string | null
}

export function resolveClusterMembers(input: {
  clusterId?: string
  nodeIds?: string[]
}): ClusterSanMember[] {
  const db = getDB()
  if (input.nodeIds?.length) {
    return db.select().from(sans).where(inArray(sans.id, input.nodeIds)).all()
  }
  if (!input.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId ou nodeIds requis' })
  }
  return db
    .select()
    .from(sans)
    .where(eq(sans.clusterId, input.clusterId))
    .all()
}
