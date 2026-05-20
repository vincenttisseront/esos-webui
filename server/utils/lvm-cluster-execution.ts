import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getSanSummary } from '../db/repositories/san.repository'
import { getDB } from '../db'
import { sans } from '../db/schema'
import { getSSHPool } from './ssh-pool'
import { collectLvmOverview, collectLvmOverviewLite } from './lvm-overview.service'
import { runLvmPreflight } from './lvm-preflight'
import {
  buildLvCreatePreview,
  buildPvCreatePreview,
  buildVgCreatePreview,
} from './lvm-actions'
import type {
  ClusterLvmExecutionPlan,
  ClusterLvmExecutionRequest,
  LvmAction,
  LvmPreflightRequest,
  PvCreatePayload,
  VgCreatePayload,
  LvCreatePayload,
} from './lvm-types'

export const CLUSTER_LVM_BLOCKED_MESSAGE =
  'Ce SAN est en cluster : les opérations LVM destructives requièrent un plan cluster validé (clusterExecution).'

export function assertClusteredSanAllowsLvmMutation(
  sanId: string,
  clusterExecution?: ClusterLvmExecutionRequest,
): { clusterId: string } | null {
  const san = getSanSummary(sanId)
  if (!san?.clusterId) return null
  if (!clusterExecution?.primarySanId) {
    throw createError({ statusCode: 409, statusMessage: CLUSTER_LVM_BLOCKED_MESSAGE })
  }
  if (clusterExecution.primarySanId !== sanId) {
    throw createError({ statusCode: 400, statusMessage: 'primarySanId doit être le SAN courant' })
  }
  return { clusterId: san.clusterId }
}

function resolveClusterNodes(clusterId: string) {
  return getDB()
    .select({ id: sans.id, label: sans.label })
    .from(sans)
    .where(and(eq(sans.clusterId, clusterId), eq(sans.clusterEnabled, true)))
    .all()
}

export async function buildClusterPvCreatePlan(
  primarySanId: string,
  clusterId: string,
  payload: PvCreatePayload,
  mappings: ClusterLvmExecutionRequest['diskMappings'],
): Promise<ClusterLvmExecutionPlan> {
  const nodes = resolveClusterNodes(clusterId)
  const nodeResults: ClusterLvmExecutionPlan['nodeResults'] = []
  const blockers: string[] = []
  const warnings: string[] = []

  for (const node of nodes) {
    const manager = getSSHPool().get(node.id)
    if (!manager || manager.getStatus() !== 'connected') {
      nodeResults.push({
        sanId: node.id,
        label: node.label,
        participation: 'skip',
        error: 'SSH non connecté',
      })
      continue
    }
    const path = node.id === primarySanId
      ? payload.path
      : mappings?.find(m => m.sourceSanId === primarySanId && m.peerSanId === node.id)?.peerPath
    if (!path) {
      blockers.push(`${node.label} : mapping PV manquant`)
      nodeResults.push({ sanId: node.id, label: node.label, participation: 'skip', error: 'Mapping manquant' })
      continue
    }
    const overview = await collectLvmOverview(manager)
    const pre = await runLvmPreflight(manager, {
      action: 'pvcreate',
      payload: { ...payload, path },
    }, overview)
    if (!pre.ok) blockers.push(...pre.blockers.map(b => `${node.label}: ${b}`))
    warnings.push(...pre.warnings)
    nodeResults.push({
      sanId: node.id,
      label: node.label,
      participation: pre.ok ? 'execute' : 'skip',
      command: buildPvCreatePreview(path, !!payload.force),
    })
  }

  return {
    action: 'pvcreate',
    clusterId,
    primarySanId,
    confirmationPhrase: `PVCREATE CLUSTER ${payload.path}`,
    nodeResults,
    okSymmetric: blockers.length === 0,
    warnings,
    blockers,
  }
}

export async function buildClusterVgCreatePlan(
  primarySanId: string,
  clusterId: string,
  payload: VgCreatePayload,
): Promise<ClusterLvmExecutionPlan> {
  blockClvmdOnCluster(clusterId)
  const nodes = resolveClusterNodes(clusterId)
  const nodeResults: ClusterLvmExecutionPlan['nodeResults'] = []
  const blockers: string[] = []

  for (const node of nodes) {
    const manager = getSSHPool().get(node.id)
    if (!manager || manager.getStatus() !== 'connected') {
      nodeResults.push({ sanId: node.id, label: node.label, participation: 'skip', error: 'SSH non connecté' })
      continue
    }
    const lite = await collectLvmOverviewLite(manager)
    if (lite.vgs.some(v => v.clustered)) {
      blockers.push(`${node.label} : VG clusterisé (clvmd) — non supporté`)
    }
    const orphanPvs = lite.pvs.filter(p => !p.vgName)
    if (!orphanPvs.length) blockers.push(`${node.label} : aucun PV libre pour vgcreate`)
    const pvPaths = orphanPvs.slice(0, payload.pvPaths.length).map(p => p.path)
    nodeResults.push({
      sanId: node.id,
      label: node.label,
      participation: pvPaths.length ? 'execute' : 'skip',
      command: buildVgCreatePreview(payload.name, pvPaths),
    })
  }

  return {
    action: 'vgcreate',
    clusterId,
    primarySanId,
    confirmationPhrase: `VGCREATE CLUSTER ${payload.name}`,
    nodeResults,
    okSymmetric: blockers.length === 0,
    warnings: ['Chaque nœud reçoit un VG local du même nom (symétrie locale, pas clvmd).'],
    blockers,
  }
}

export async function buildClusterLvCreatePlan(
  primarySanId: string,
  clusterId: string,
  payload: LvCreatePayload,
): Promise<ClusterLvmExecutionPlan> {
  blockClvmdOnCluster(clusterId)
  const nodes = resolveClusterNodes(clusterId)
  const nodeResults: ClusterLvmExecutionPlan['nodeResults'] = []

  for (const node of nodes) {
    const manager = getSSHPool().get(node.id)
    if (!manager || manager.getStatus() !== 'connected') {
      nodeResults.push({ sanId: node.id, label: node.label, participation: 'skip', error: 'SSH non connecté' })
      continue
    }
    const lite = await collectLvmOverviewLite(manager)
    const vg = lite.vgs.find(v => v.name === payload.vgName)
    nodeResults.push({
      sanId: node.id,
      label: node.label,
      participation: vg ? 'execute' : 'skip',
      command: buildLvCreatePreview(payload.vgName, payload.name, payload.sizeBytes),
      error: vg ? undefined : `VG ${payload.vgName} absent`,
    })
  }

  return {
    action: 'lvcreate',
    clusterId,
    primarySanId,
    confirmationPhrase: `LVCREATE CLUSTER ${payload.vgName}/${payload.name}`,
    nodeResults,
    okSymmetric: nodeResults.every(n => n.participation === 'execute'),
    warnings: [],
    blockers: nodeResults.filter(n => n.participation !== 'execute').map(n => `${n.label}: ${n.error ?? 'skip'}`),
  }
}

function blockClvmdOnCluster(clusterId: string) {
  const nodes = resolveClusterNodes(clusterId)
  for (const node of nodes) {
    const manager = getSSHPool().get(node.id)
    if (!manager || manager.getStatus() !== 'connected') continue
  }
}

export async function loadClusterPeerLvmDetection(currentSanId: string) {
  let clusterId: string | null = null
  try {
    const row = getDB()
      .select({ clusterId: sans.clusterId, clusterEnabled: sans.clusterEnabled })
      .from(sans)
      .where(eq(sans.id, currentSanId))
      .get()
    if (!row?.clusterId || !row.clusterEnabled) return []
    clusterId = row.clusterId
  } catch {
    return []
  }

  const peers = getDB()
    .select({ id: sans.id, label: sans.label })
    .from(sans)
    .where(and(eq(sans.clusterId, clusterId), eq(sans.clusterEnabled, true)))
    .all()
    .filter(p => p.id !== currentSanId)

  const pool = getSSHPool()
  const snapshots = await Promise.all(peers.map(async (peer) => {
    const manager = pool.get(peer.id)
    if (!manager || manager.getStatus() !== 'connected') {
      return { nodeSanId: peer.id, nodeLabel: peer.label, pvs: [], vgs: [], lvs: [] }
    }
    try {
      const lite = await collectLvmOverviewLite(manager)
      return {
        nodeSanId: peer.id,
        nodeLabel: peer.label,
        pvs: lite.pvs,
        vgs: lite.vgs,
        lvs: lite.lvs,
      }
    } catch {
      return { nodeSanId: peer.id, nodeLabel: peer.label, pvs: [], vgs: [], lvs: [] }
    }
  }))
  return snapshots
}

