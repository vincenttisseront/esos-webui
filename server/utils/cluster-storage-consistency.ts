import type { ClusterStorageConsistencyResult } from './cluster-admin-types'
import { resolveClusterMembers } from './cluster-resolve'
import { collectClusterStorageInventory } from './raid-cluster-storage-preflight'
import { buildClusterMdRecoveryAssessment } from './raid-cluster-md-node-state'
import { getDB } from '../db'
import { clusters } from '../db/schema'
import { eq } from 'drizzle-orm'

function buildScstConsistencySummary(nodeCount: number): ClusterStorageConsistencyResult['scst'] {
  return {
    checked: nodeCount >= 2,
    symmetric: null,
    summary: nodeCount >= 2
      ? 'Comparaison automatique SCST inter-nœuds non disponible — en Active/Active, valider manuellement les cibles et groupes ALUA.'
      : 'Un seul nœud — cohérence SCST inter-nœuds non applicable.',
  }
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
    scst: buildScstConsistencySummary(members.length),
  }
}
