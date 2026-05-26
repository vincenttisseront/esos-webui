import type { ClusterNodeStatus } from './types'
import type { ClusterStorageConsistencyResult } from './cluster-admin-types'
import { compareScstAluaFingerprintSymmetry } from './alua-cluster-compare'
import { aluaFingerprintFromDeviceGroups } from './alua-model'
import { readClusterNodeStatus } from './cluster-reader'
import { resolveClusterMembers } from './cluster-resolve'
import { collectClusterStorageInventory } from './raid-cluster-storage-preflight'
import { buildClusterMdRecoveryAssessment } from './raid-cluster-md-node-state'
import { getDB } from '../db'
import { clusters } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { ClusterNodeRole } from './types'
import {
  assessMdLvmClusterSymmetry,
  collectMdArrayLvmStates,
  filterMdClusterAsymmetryHardBlockers,
} from '../../utils/md-lvm-cluster-symmetry'
import { filterMdHealthWarnings } from '../../utils/cluster-md-symmetry'

export function compareScstAluaSymmetry(
  nodeStatuses: ClusterNodeStatus[],
): ClusterStorageConsistencyResult['scst'] {
  return compareScstAluaFingerprintSymmetry(
    nodeStatuses.map(n => ({
      sshReady:     n.sshReady,
      deviceGroups: n.aluaDeviceGroups ?? [],
    })),
  )
}

export { aluaFingerprintFromDeviceGroups }

async function buildScstConsistencyForCluster(
  clusterId: string,
  members: ReturnType<typeof resolveClusterMembers>,
): Promise<ClusterStorageConsistencyResult['scst']> {
  if (members.length < 2) {
    return {
      checked: false,
      symmetric: null,
      summaryKey: 'cluster.alua.scst.not_applicable',
    }
  }

  const statuses = await Promise.all(
    members.map(m =>
      readClusterNodeStatus(m.id, m.host, (m.clusterRole ?? 'secondary') as ClusterNodeRole),
    ),
  )
  return compareScstAluaSymmetry(statuses)
}

async function collectLvmInventoriesForMdHealth(
  clusterId: string,
  inventories: Awaited<ReturnType<typeof collectClusterStorageInventory>>,
) {
  try {
    const { collectClusterLvmInventory } = await import('./lvm-cluster-preflight')
    const lvmNodes = await collectClusterLvmInventory(clusterId)
    return lvmNodes.map(n => ({
      sanId: n.sanId,
      label: n.label,
      mdArrays: inventories.find(i => i.sanId === n.sanId)?.mdArrays ?? [],
      pvs: n.overview.pvs.map(p => ({ path: p.path, vgName: p.vgName })),
    }))
  } catch {
    return inventories.map(inv => ({
      sanId: inv.sanId,
      label: inv.label,
      mdArrays: inv.mdArrays,
      pvs: [] as Array<{ path: string; vgName: string }>,
    }))
  }
}

export async function buildClusterStorageConsistency(
  clusterId: string,
): Promise<ClusterStorageConsistencyResult> {
  const db = getDB()
  const cluster = db.select().from(clusters).where(eq(clusters.id, clusterId)).get()
  const members = resolveClusterMembers({ clusterId })
  const inventories = await collectClusterStorageInventory({ clusterId })
  const lvmInventories = await collectLvmInventoriesForMdHealth(clusterId, inventories)

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
      const mdLvmStates = collectMdArrayLvmStates(lvmInventories, name)
      const mdLvmIssues = assessMdLvmClusterSymmetry(mdLvmStates)
      const healthBlockers = filterMdClusterAsymmetryHardBlockers(
        assessment.hardBlockers,
        mdLvmIssues,
      )
      const healthWarnings = filterMdHealthWarnings(assessment.warnings)
      const structurallySymmetric = assessment.structurallySymmetric

      mdArrays.push({
        arrayName: name,
        okSymmetric: structurallySymmetric,
        okDegraded: assessment.okDegraded,
        hardBlockers: healthBlockers,
        warnings: healthWarnings,
      })

      const hasCriticalLvmAsymmetry = mdLvmIssues.some(i => i.severity === 'critical')
      if (healthBlockers.length || hasCriticalLvmAsymmetry) {
        overall = 'critical'
      } else if (!structurallySymmetric && overall === 'ok') {
        overall = 'warning'
      } else if (healthWarnings.length && overall === 'ok') {
        overall = 'warning'
      }
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

  const asymmetricCount = mdArrays.filter(a => !a.okSymmetric).length
  const mdSummary = mdArrays.length === 0
    ? 'Aucun tableau MD détecté sur le cluster'
    : asymmetricCount === 0
      ? `${mdArrays.length} tableau(x) MD symétrique(s)`
      : `${asymmetricCount} tableau(x) MD avec écart structurel entre nœuds`

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
