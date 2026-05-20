import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getSanSummary } from '../db/repositories/san.repository'
import { getDB } from '../db'
import { sans } from '../db/schema'
import { getSSHPool } from './ssh-pool'
import { collectLvmOverviewLite } from './lvm-overview.service'
import {
  buildLvCreatePreview,
  buildLvRemovePreview,
  buildPvCreatePreview,
  buildPvRemovePreview,
  buildVgCreatePreview,
  buildVgRemovePreview,
  runLvCreate,
  runLvRemove,
  runPvCreate,
  runPvRemove,
  runVgCreate,
  runVgRemove,
} from './lvm-actions'
import { invalidateCacheKey } from './cache'

function invalidateStorageCaches(sanId: string) {
  invalidateCacheKey(`lvm-overview-${sanId}`)
  invalidateCacheKey(`raid-overview-${sanId}`)
}
import {
  collectClusterLvmInventory,
  resolvePeerPvPaths,
  runClusterLvmPreflight,
} from './lvm-cluster-preflight'
import { withSanContext } from './ssh-runtime'
import type {
  ClusterLvmDiskMapping,
  ClusterLvmExecutionPlan,
  ClusterLvmExecutionRequest,
  ClusterLvmExecutionResult,
  ClusterLvmNodeResult,
  LvCreatePayload,
  LvRemovePayload,
  PvCreatePayload,
  PvRemovePayload,
  VgCreatePayload,
  VgRemovePayload,
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

function assertPlanExecutable(plan: ClusterLvmExecutionPlan) {
  if (!plan.okSymmetric) {
    throw createError({
      statusCode: 422,
      statusMessage: plan.blockers.join(' · ') || 'Plan cluster non symétrique',
    })
  }
  const missing = plan.nodeResults.filter(n => n.participation !== 'execute')
  if (missing.length) {
    throw createError({
      statusCode: 422,
      statusMessage: `Nœuds non exécutables : ${missing.map(n => n.label).join(', ')}`,
    })
  }
}

export async function buildClusterPvCreatePlan(
  primarySanId: string,
  clusterId: string,
  payload: PvCreatePayload,
  mappings: ClusterLvmDiskMapping[] = [],
): Promise<ClusterLvmExecutionPlan> {
  const pre = await runClusterLvmPreflight(clusterId, primarySanId, {
    action: 'pvcreate',
    payload,
    clusterExecution: { primarySanId, clusterId, diskMappings: mappings },
  })
  const diskMappings = pre.mappings.length ? pre.mappings : mappings
  const nodes = resolveClusterNodes(clusterId)
  const nodeResults: ClusterLvmNodeResult[] = []

  for (const node of nodes) {
    const inv = pre.nodes.find(n => n.sanId === node.id)
    if (!inv?.sshReady) {
      nodeResults.push({ sanId: node.id, label: node.label, participation: 'skip', error: inv?.error ?? 'SSH non connecté' })
      continue
    }
    const path = node.id === primarySanId
      ? payload.path
      : diskMappings.find(m => m.sourcePath === payload.path && m.peerSanId === node.id)?.peerPath
    if (!path) {
      nodeResults.push({ sanId: node.id, label: node.label, participation: 'skip', error: 'Mapping manquant' })
      continue
    }
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
    okSymmetric: pre.ok && nodeResults.every(n => n.participation === 'execute'),
    warnings: pre.warnings,
    blockers: pre.blockers,
  }
}

export async function buildClusterVgCreatePlan(
  primarySanId: string,
  clusterId: string,
  payload: VgCreatePayload,
  mappings: ClusterLvmDiskMapping[] = [],
): Promise<ClusterLvmExecutionPlan> {
  const pre = await runClusterLvmPreflight(clusterId, primarySanId, {
    action: 'vgcreate',
    payload,
    clusterExecution: { primarySanId, clusterId, diskMappings: mappings },
  })
  const nodes = resolveClusterNodes(clusterId)
  const nodeResults: ClusterLvmNodeResult[] = []

  for (const node of nodes) {
    const inv = pre.nodes.find(n => n.sanId === node.id)
    if (!inv?.sshReady) {
      nodeResults.push({ sanId: node.id, label: node.label, participation: 'skip', error: 'SSH non connecté' })
      continue
    }
    const pvPaths = node.id === primarySanId
      ? payload.pvPaths
      : resolvePeerPvPaths(primarySanId, payload.pvPaths, node.id, pre.nodes, pre.mappings)
    nodeResults.push({
      sanId: node.id,
      label: node.label,
      participation: pre.ok && pvPaths.length === payload.pvPaths.length ? 'execute' : 'skip',
      command: buildVgCreatePreview(payload.name, pvPaths),
      error: pvPaths.length ? undefined : 'PV non mappés',
    })
  }

  return {
    action: 'vgcreate',
    clusterId,
    primarySanId,
    confirmationPhrase: `VGCREATE CLUSTER ${payload.name}`,
    nodeResults,
    okSymmetric: pre.ok && nodeResults.every(n => n.participation === 'execute'),
    warnings: [...pre.warnings, 'Chaque nœud reçoit un VG local du même nom (symétrie locale, pas clvmd).'],
    blockers: pre.blockers,
  }
}

export async function buildClusterLvCreatePlan(
  primarySanId: string,
  clusterId: string,
  payload: LvCreatePayload,
): Promise<ClusterLvmExecutionPlan> {
  const pre = await runClusterLvmPreflight(clusterId, primarySanId, {
    action: 'lvcreate',
    payload,
    clusterExecution: { primarySanId, clusterId },
  })
  const nodes = resolveClusterNodes(clusterId)
  const nodeResults: ClusterLvmNodeResult[] = []

  for (const node of nodes) {
    const inv = pre.nodes.find(n => n.sanId === node.id)
    if (!inv?.sshReady) {
      nodeResults.push({ sanId: node.id, label: node.label, participation: 'skip', error: 'SSH non connecté' })
      continue
    }
    const vg = inv.overview.vgs.find(v => v.name === payload.vgName)
    nodeResults.push({
      sanId: node.id,
      label: node.label,
      participation: pre.ok && vg && vg.freeBytes >= payload.sizeBytes ? 'execute' : 'skip',
      command: buildLvCreatePreview(payload.vgName, payload.name, payload.sizeBytes),
      error: vg ? (vg.freeBytes >= payload.sizeBytes ? undefined : 'Espace insuffisant') : `VG ${payload.vgName} absent`,
    })
  }

  return {
    action: 'lvcreate',
    clusterId,
    primarySanId,
    confirmationPhrase: `LVCREATE CLUSTER ${payload.vgName}/${payload.name}`,
    nodeResults,
    okSymmetric: pre.ok && nodeResults.every(n => n.participation === 'execute'),
    warnings: pre.warnings,
    blockers: pre.blockers,
  }
}

function resolvePvPathOnNode(
  nodeSanId: string,
  primarySanId: string,
  sourcePath: string,
  mappings: ClusterLvmDiskMapping[],
): string {
  return nodeSanId === primarySanId
    ? sourcePath
    : mappings.find(m => m.sourcePath === sourcePath && m.peerSanId === nodeSanId)?.peerPath ?? sourcePath
}

export async function buildClusterPvRemovePlan(
  primarySanId: string,
  clusterId: string,
  payload: PvRemovePayload,
  mappings: ClusterLvmDiskMapping[] = [],
): Promise<ClusterLvmExecutionPlan> {
  const pre = await runClusterLvmPreflight(clusterId, primarySanId, {
    action: 'pvremove',
    payload,
    clusterExecution: { primarySanId, clusterId, diskMappings: mappings },
  })
  const diskMappings = pre.mappings.length ? pre.mappings : mappings
  const nodes = resolveClusterNodes(clusterId)
  const nodeResults: ClusterLvmNodeResult[] = []

  for (const node of nodes) {
    const inv = pre.nodes.find(n => n.sanId === node.id)
    if (!inv?.sshReady) {
      nodeResults.push({ sanId: node.id, label: node.label, participation: 'skip', error: inv?.error ?? 'SSH non connecté' })
      continue
    }
    const path = resolvePvPathOnNode(node.id, primarySanId, payload.path, diskMappings)
    nodeResults.push({
      sanId: node.id,
      label: node.label,
      participation: pre.ok ? 'execute' : 'skip',
      command: buildPvRemovePreview(path),
    })
  }

  return {
    action: 'pvremove',
    clusterId,
    primarySanId,
    confirmationPhrase: `PVREMOVE CLUSTER ${payload.path}`,
    nodeResults,
    okSymmetric: pre.ok && nodeResults.every(n => n.participation === 'execute'),
    warnings: pre.warnings,
    blockers: pre.blockers,
  }
}

export async function buildClusterVgRemovePlan(
  primarySanId: string,
  clusterId: string,
  payload: VgRemovePayload,
): Promise<ClusterLvmExecutionPlan> {
  const pre = await runClusterLvmPreflight(clusterId, primarySanId, {
    action: 'vgremove',
    payload,
    clusterExecution: { primarySanId, clusterId },
  })
  const nodes = resolveClusterNodes(clusterId)
  const nodeResults: ClusterLvmNodeResult[] = []

  for (const node of nodes) {
    const inv = pre.nodes.find(n => n.sanId === node.id)
    if (!inv?.sshReady) {
      nodeResults.push({ sanId: node.id, label: node.label, participation: 'skip', error: 'SSH non connecté' })
      continue
    }
    nodeResults.push({
      sanId: node.id,
      label: node.label,
      participation: pre.ok ? 'execute' : 'skip',
      command: buildVgRemovePreview(payload.name),
    })
  }

  return {
    action: 'vgremove',
    clusterId,
    primarySanId,
    confirmationPhrase: `VGREMOVE CLUSTER ${payload.name}`,
    nodeResults,
    okSymmetric: pre.ok && nodeResults.every(n => n.participation === 'execute'),
    warnings: pre.warnings,
    blockers: pre.blockers,
  }
}

export async function buildClusterLvRemovePlan(
  primarySanId: string,
  clusterId: string,
  payload: LvRemovePayload,
): Promise<ClusterLvmExecutionPlan> {
  const pre = await runClusterLvmPreflight(clusterId, primarySanId, {
    action: 'lvremove',
    payload,
    clusterExecution: { primarySanId, clusterId },
  })
  const nodes = resolveClusterNodes(clusterId)
  const nodeResults: ClusterLvmNodeResult[] = []

  for (const node of nodes) {
    const inv = pre.nodes.find(n => n.sanId === node.id)
    if (!inv?.sshReady) {
      nodeResults.push({ sanId: node.id, label: node.label, participation: 'skip', error: 'SSH non connecté' })
      continue
    }
    nodeResults.push({
      sanId: node.id,
      label: node.label,
      participation: pre.ok ? 'execute' : 'skip',
      command: buildLvRemovePreview(payload.vgName, payload.name),
    })
  }

  return {
    action: 'lvremove',
    clusterId,
    primarySanId,
    confirmationPhrase: `LVREMOVE CLUSTER ${payload.vgName}/${payload.name}`,
    nodeResults,
    okSymmetric: pre.ok && nodeResults.every(n => n.participation === 'execute'),
    warnings: pre.warnings,
    blockers: pre.blockers,
  }
}

export async function executeClusterLvmPlan(
  plan: ClusterLvmExecutionPlan,
  clusterExecution: ClusterLvmExecutionRequest,
  payload: PvCreatePayload | VgCreatePayload | LvCreatePayload | PvRemovePayload | VgRemovePayload | LvRemovePayload,
  diskMappings: ClusterLvmDiskMapping[] = [],
): Promise<ClusterLvmExecutionResult> {
  assertPlanExecutable(plan)
  const confirmation = String((payload as { confirmation?: string }).confirmation ?? '').trim()
  if (confirmation !== plan.confirmationPhrase) {
    throw createError({
      statusCode: 400,
      statusMessage: `Confirmation requise : ${plan.confirmationPhrase}`,
    })
  }

  const clusterId = plan.clusterId ?? clusterExecution.clusterId
  if (!clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId requis' })
  }

  const inventories = clusterId
    ? await collectClusterLvmInventory(clusterId)
    : []

  const nodeResults: ClusterLvmNodeResult[] = []
  const errors: string[] = []
  const refreshedSanIds = new Set<string>()

  for (const node of plan.nodeResults.filter(n => n.participation === 'execute')) {
    try {
      await withSanContext(node.sanId, async () => {
        const manager = getSSHPool().get(node.sanId)
        if (!manager || manager.getStatus() !== 'connected') {
          throw new Error('SSH non connecté')
        }
        if (plan.action === 'pvremove') {
          const p = payload as PvRemovePayload
          const path = resolvePvPathOnNode(node.sanId, clusterExecution.primarySanId, p.path, diskMappings)
          const result = await runPvRemove(manager, path)
          nodeResults.push({
            sanId: node.sanId,
            label: node.label,
            participation: 'execute',
            command: node.command,
            stdout: result.stdout,
            stderr: result.stderr,
          })
        } else if (plan.action === 'pvcreate') {
          const p = payload as PvCreatePayload
          const path = resolvePvPathOnNode(node.sanId, clusterExecution.primarySanId, p.path, diskMappings)
          const result = await runPvCreate(manager, path, !!p.force)
          nodeResults.push({
            sanId: node.sanId,
            label: node.label,
            participation: 'execute',
            command: node.command,
            stdout: result.stdout,
            stderr: result.stderr,
          })
        } else if (plan.action === 'vgcreate') {
          const p = payload as VgCreatePayload
          const pvPaths = node.sanId === clusterExecution.primarySanId
            ? p.pvPaths
            : resolvePeerPvPaths(clusterExecution.primarySanId, p.pvPaths, node.sanId, inventories, diskMappings)
          const result = await runVgCreate(manager, p.name, pvPaths)
          nodeResults.push({
            sanId: node.sanId,
            label: node.label,
            participation: 'execute',
            command: node.command,
            stdout: result.stdout,
            stderr: result.stderr,
          })
        } else if (plan.action === 'vgremove') {
          const p = payload as VgRemovePayload
          const result = await runVgRemove(manager, p.name)
          nodeResults.push({
            sanId: node.sanId,
            label: node.label,
            participation: 'execute',
            command: node.command,
            stdout: result.stdout,
            stderr: result.stderr,
          })
        } else if (plan.action === 'lvcreate') {
          const p = payload as LvCreatePayload
          const result = await runLvCreate(manager, p.vgName, p.name, p.sizeBytes)
          nodeResults.push({
            sanId: node.sanId,
            label: node.label,
            participation: 'execute',
            command: node.command,
            stdout: result.stdout,
            stderr: result.stderr,
          })
        } else if (plan.action === 'lvremove') {
          const p = payload as LvRemovePayload
          const result = await runLvRemove(manager, p.vgName, p.name)
          nodeResults.push({
            sanId: node.sanId,
            label: node.label,
            participation: 'execute',
            command: node.command,
            stdout: result.stdout,
            stderr: result.stderr,
          })
        }
        invalidateStorageCaches(node.sanId)
        refreshedSanIds.add(node.sanId)
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({
        sanId: node.sanId,
        label: node.label,
        participation: 'failed',
        command: node.command,
        error: msg,
      })
    }
  }

  return {
    success: errors.length === 0,
    action: plan.action,
    clusterId,
    primarySanId: clusterExecution.primarySanId,
    nodeResults,
    refreshedSanIds: [...refreshedSanIds],
    errors,
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
