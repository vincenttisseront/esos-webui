import { eq } from 'drizzle-orm'
import { getDB } from '../db'
import { clusters } from '../db/schema'
import { readClusterNodeStatus } from './cluster-reader'
import { resolveClusterMembers } from './cluster-resolve'
import { buildAluaNodeSnapshot, compareAluaCluster } from './alua-cluster-compare'
import { getSSHPool } from './ssh-pool'
import { readScstConfig } from './scst-config-reader'
import type { ClusterNodeRole } from './types'
import type { AluaClusterReport } from '../../types/alua'

export async function buildAluaClusterReport(
  clusterId: string,
  options: { includeScstCrossCheck?: boolean } = {},
): Promise<AluaClusterReport> {
  const db = getDB()
  const cluster = db.select().from(clusters).where(eq(clusters.id, clusterId)).get()
  const members = resolveClusterMembers({ clusterId })

  const statuses = await Promise.all(
    members.map(m =>
      readClusterNodeStatus(m.id, m.host, (m.clusterRole ?? 'secondary') as ClusterNodeRole),
    ),
  )

  statuses.forEach((s, i) => {
    const label = members[i]?.label
    if (label && (!s.hostname || s.hostname === 'localhost')) s.hostname = label
  })

  let scstTargetsByNode: Map<string, Set<string>> | undefined
  if (options.includeScstCrossCheck) {
    scstTargetsByNode = new Map()
    const pool = getSSHPool()
    await Promise.all(
      members.map(async (m, i) => {
        const status = statuses[i]
        if (!status?.sshReady) return
        const mgr = pool.get(m.id)
        if (!mgr || mgr.getStatus() !== 'connected') return
        try {
          const conf = await readScstConfig(mgr)
          const names = new Set<string>()
          for (const driver of conf.drivers) {
            for (const t of driver.targets) names.add(t.name)
          }
          scstTargetsByNode!.set(m.id, names)
        } catch { /* skip cross-check for this node */ }
      }),
    )
  }

  const nodes = statuses.map(s =>
    buildAluaNodeSnapshot(s.nodeId, s.hostname, s.host, s.sshReady, s.aluaDeviceGroups ?? []),
  )

  const comparison = compareAluaCluster(nodes, {
    scstTargetsByNode,
    expectLocalRemotePair: members.length === 2,
  })

  return {
    clusterId,
    clusterName: cluster?.name,
    scannedAt:   Date.now(),
    nodes,
    comparison,
  }
}
