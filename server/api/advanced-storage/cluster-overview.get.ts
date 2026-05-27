import { createError } from 'h3'
import { getAllSans } from '../../db/repositories/san.repository'
import { getSSHPool } from '../../utils/ssh-pool'
import { withSanContext } from '../../utils/ssh-runtime'
import { collectAdvancedStorageOverview } from '../../utils/advanced-storage-collector'
import { withCache, invalidateCacheKey } from '../../utils/cache'
import type {
  AdvancedStorageClusterNodeSnapshot,
  AdvancedStorageClusterOverview,
  AdvancedTechHealth,
} from '~/types/advanced-storage'

function nodeTechHealth(
  snapshot: AdvancedStorageClusterNodeSnapshot,
): AdvancedTechHealth {
  const techs = snapshot.overview?.technologies.filter(t => !t.deprecated) ?? []
  if (!techs.length) return snapshot.error ? 'unknown' : 'n/a'
  if (techs.some(t => t.health === 'critical')) return 'critical'
  if (techs.some(t => t.health === 'warning')) return 'warning'
  if (techs.every(t => t.health === 'ok' || t.health === 'n/a')) return 'ok'
  return 'unknown'
}

function buildSymmetry(nodes: AdvancedStorageClusterNodeSnapshot[]) {
  const notes: string[] = []
  const withOverview = nodes.filter(n => n.overview)
  if (withOverview.length < 2) {
    return { symmetry: 'unknown' as const, symmetryNotes: notes }
  }

  const drbdCounts = withOverview.map(n => n.drbdResourceCount)
  const uniqueDrbd = new Set(drbdCounts)
  if (uniqueDrbd.size > 1) {
    notes.push('drbd_resource_count_mismatch')
  }

  const activeSets = withOverview.map(n =>
    (n.overview?.technologies ?? [])
      .filter(t => t.presence === 'active')
      .map(t => t.id)
      .sort()
      .join(','),
  )
  if (new Set(activeSets).size > 1) {
    notes.push('active_technologies_mismatch')
  }

  return {
    symmetry: notes.length ? 'warning' as const : 'ok' as const,
    symmetryNotes: notes,
  }
}

export default defineEventHandler(async (event) => {
  const { clusterId, refresh } = getQuery(event) as { clusterId?: string; refresh?: string }
  if (!clusterId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId required' })
  }

  const clusterSans = getAllSans().filter(s => s.clusterId === clusterId && s.status === 'active')
  if (!clusterSans.length) {
    throw createError({ statusCode: 404, statusMessage: 'Cluster not found or has no active nodes' })
  }

  const cacheKey = `advanced-storage-cluster-${clusterId}`
  if (refresh === '1') invalidateCacheKey(cacheKey)

  return withCache(cacheKey, 60_000, async (): Promise<AdvancedStorageClusterOverview> => {
    const pool = getSSHPool()
    const nodes: AdvancedStorageClusterNodeSnapshot[] = []

    for (const san of clusterSans) {
      const mgr = pool.get(san.id)
      const base: AdvancedStorageClusterNodeSnapshot = {
        sanId: san.id,
        label: san.label,
        clusterRole: san.clusterRole,
        readOnly: san.readOnly,
        sshReady: !!mgr?.isReady(),
        drbdResourceCount: 0,
        techHealth: 'unknown',
      }

      if (!mgr?.isReady()) {
        nodes.push({ ...base, error: 'SSH not connected' })
        continue
      }

      try {
        const overview = await withSanContext(san.id, () =>
          collectAdvancedStorageOverview(mgr, san.id, clusterId),
        )
        const snap: AdvancedStorageClusterNodeSnapshot = {
          ...base,
          overview,
          drbdResourceCount: overview.drbd.resources.length,
          techHealth: 'unknown',
        }
        snap.techHealth = nodeTechHealth(snap)
        nodes.push(snap)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        nodes.push({ ...base, error: message })
      }
    }

    const sym = buildSymmetry(nodes)
    const primary = clusterSans.find(s => s.clusterRole === 'primary')

    return {
      clusterId,
      clusterName: primary?.label ? `Cluster (${primary.label})` : clusterId,
      scannedAt: Date.now(),
      nodes,
      ...sym,
    }
  })
})
