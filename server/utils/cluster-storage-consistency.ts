import type { ClusterNodeStatus } from './types'
import type { ClusterStorageConsistencyResult } from './cluster-admin-types'
import { readClusterNodeStatus } from './cluster-reader'
import { resolveClusterMembers } from './cluster-resolve'
import { collectClusterStorageInventory } from './raid-cluster-storage-preflight'
import { buildClusterMdRecoveryAssessment } from './raid-cluster-md-node-state'
import { getDB } from '../db'
import { clusters } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { ClusterNodeRole } from './types'

function aluaFingerprint(node: ClusterNodeStatus): string {
  return node.aluaGroups
    .map(g => `${g.deviceGroup}/${g.targetGroup}:${g.state}`)
    .sort()
    .join('|')
}

export function compareScstAluaSymmetry(
  nodeStatuses: ClusterNodeStatus[],
): ClusterStorageConsistencyResult['scst'] {
  const ready = nodeStatuses.filter(n => n.sshReady)
  if (ready.length < 2) {
    return {
      checked: ready.length >= 2,
      symmetric: null,
      summary: 'Un seul nœud joignable — cohérence SCST inter-nœuds non applicable.',
    }
  }

  const fingerprints = ready.map(n => aluaFingerprint(n))
  const nonEmpty = fingerprints.filter(f => f.length > 0)
  if (nonEmpty.length < 2) {
    return {
      checked: true,
      symmetric: null,
      summary: 'Groupes ALUA non exposés sur tous les nœuds — validation manuelle recommandée en Active/Active.',
    }
  }

  const unique = new Set(nonEmpty)
  const symmetric = unique.size === 1
  return {
    checked: true,
    symmetric,
    summary: symmetric
      ? 'Groupes ALUA identiques sur les nœuds joignables.'
      : `Empreintes ALUA différentes entre nœuds (${unique.size} profils) — vérifier SCST et basculement.`,
  }
}

async function buildScstConsistencyForCluster(
  clusterId: string,
  members: ReturnType<typeof resolveClusterMembers>,
): Promise<ClusterStorageConsistencyResult['scst']> {
  if (members.length < 2) {
    return {
      checked: false,
      symmetric: null,
      summary: 'Un seul nœud — cohérence SCST inter-nœuds non applicable.',
    }
  }

  const statuses = await Promise.all(
    members.map(m =>
      readClusterNodeStatus(m.id, m.host, (m.clusterRole ?? 'secondary') as ClusterNodeRole),
    ),
  )
  return compareScstAluaSymmetry(statuses)
}

export async function buildClusterStorageConsistency(
  clusterId: string,
): Promise<ClusterStorageConsistencyResult> {
  const db = getDB()
  const cluster = db.select().from(clusters).where(eq(clusters.id, clusterId)).get()
  const members = resolveClusterMembers({ clusterId })
  const inventories = await collectClusterStorageInventory({ clusterId })

  const arrayNames = new Set<string>()
  for (const inv of inventories) {
    for (const arr of inv.mdArrays) arrayNames.add(arr.name)
    for (const arr of inv.stoppedMdArrays ?? []) {
      if (arr.name && arr.name !== 'unknown') arrayNames.add(arr.name)
    }
  }

  const mdArrays: ClusterStorageConsistencyResult['mdArrays'] = []
  let overall: ClusterStorageConsistencyResult['overall'] = 'ok'

  for (const name of arrayNames) {
    try {
      const assessment = buildClusterMdRecoveryAssessment({
        action: 'stop_md',
        arrayName: name,
        nodes: inventories,
      })
      mdArrays.push({
        arrayName: name,
        okSymmetric: assessment.okSymmetric,
        okDegraded: assessment.okDegraded,
        hardBlockers: assessment.hardBlockers,
        warnings: assessment.warnings,
      })
      if (assessment.hardBlockers.length) overall = 'critical'
      else if (!assessment.okSymmetric && overall === 'ok') overall = 'warning'
    } catch {
      mdArrays.push({
        arrayName: name,
        okSymmetric: false,
        okDegraded: false,
        hardBlockers: ['Évaluation symétrie impossible'],
        warnings: [],
      })
      overall = 'warning'
    }
  }

  if (inventories.some(i => !i.sshReady)) {
    overall = overall === 'critical' ? 'critical' : 'warning'
  }

  const nodes = inventories.map(inv => ({
    sanId: inv.sanId,
    label: inv.label,
    sshReady: inv.sshReady,
    mdActiveCount: inv.mdArrays.length,
    stoppedMdCount: inv.stoppedMdArrays?.length ?? 0,
    hasMdDetection: inv.mdArrays.length > 0 || (inv.stoppedMdArrays?.length ?? 0) > 0,
    error: inv.error,
  }))

  const mdSummary = mdArrays.length === 0
    ? 'Aucun tableau MD détecté sur le cluster'
    : mdArrays.every(a => a.okSymmetric)
      ? `${mdArrays.length} tableau(x) MD symétrique(s)`
      : `${mdArrays.filter(a => !a.okSymmetric).length} tableau(x) MD non symétrique(s)`

  return {
    clusterId,
    clusterName: cluster?.name,
    scannedAt: Date.now(),
    overall: inventories.length === 0 ? 'unknown' : overall,
    mdSummary,
    mdArrays,
    nodes,
    scst: await buildScstConsistencyForCluster(clusterId, members),
  }
}
