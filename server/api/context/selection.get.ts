import { getSansSelectionRows } from '~/server/db/repositories/san.repository'
import { getDB } from '~/server/db'
import { clusters, sans } from '~/server/db/schema'
import { getSSHPool } from '~/server/utils/ssh-pool'
import type { SelectionContextResponse } from '~/server/utils/selection-context'

/**
 * GET /api/context/selection — viewer-safe SAN/cluster list + live SSH statuses.
 * Does not expose host, credentials, settings, or other admin-only fields.
 */
export default defineEventHandler((): SelectionContextResponse => {
  const sansList = getSansSelectionRows()

  const db = getDB()
  const allClusters = db
    .select({ id: clusters.id, name: clusters.name })
    .from(clusters)
    .all()

  const nodeRows = db
    .select({
      id:          sans.id,
      label:       sans.label,
      status:      sans.status,
      clusterRole: sans.clusterRole,
      clusterId:   sans.clusterId,
    })
    .from(sans)
    .all()

  const clustersPayload = allClusters.map((c) => ({
    id:    c.id,
    name:  c.name,
    nodes: nodeRows
      .filter((s) => s.clusterId === c.id)
      .map((s) => ({
        id:          s.id,
        label:       s.label,
        status:      s.status,
        clusterRole: s.clusterRole ?? null,
      })),
  }))

  let sshStatuses: SelectionContextResponse['sshStatuses'] = {}
  try {
    sshStatuses = getSSHPool().getAllStatuses()
  } catch {
    sshStatuses = {}
  }

  return {
    sans:        sansList,
    clusters:    clustersPayload,
    sshStatuses,
  }
})
