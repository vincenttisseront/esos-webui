import { createError } from 'h3'
import { getSanSummary } from '../db/repositories/san.repository'
import { assertClusterNodesWritable, resolveClusterEnabledNodes } from './cluster-readonly'
import { getSSHPool } from './ssh-pool'
import { withSanContext } from './ssh-runtime'
import { collectFsOverview } from './fs-overview.service'
import { runFsPreflight, type FsPreflightRequest } from './fs-preflight'
import { runCreateFilesystem, runCreateVdisk, runBindFileio } from './fs-actions'
import { invalidateFsCaches } from './fs-api-helpers'
import type { ClusterLvmNodeResult } from '~/types/lvm'
import type { CreateFsPayload, CreateVdiskPayload, CreateFileioPayload } from '~/types/filesystem'

export const CLUSTER_FS_BLOCKED_MESSAGE =
  'Ce SAN est en cluster : les opérations filesystem requièrent clusterExecution.'

export interface ClusterFsExecutionRequest {
  clusterId: string
  primarySanId: string
}

export interface ClusterFsExecutionResult {
  success: boolean
  nodeResults: ClusterLvmNodeResult[]
  errors: string[]
}

export function assertClusteredSanAllowsFsMutation(
  sanId: string,
  clusterExecution?: ClusterFsExecutionRequest,
): { clusterId: string } | null {
  const san = getSanSummary(sanId)
  if (!san?.clusterId) return null
  if (!clusterExecution?.primarySanId) {
    throw createError({ statusCode: 409, statusMessage: CLUSTER_FS_BLOCKED_MESSAGE })
  }
  if (clusterExecution.primarySanId !== sanId) {
    throw createError({ statusCode: 400, statusMessage: 'primarySanId doit être le SAN courant' })
  }
  return { clusterId: san.clusterId }
}

async function runPreflightOnNode(
  sanId: string,
  req: FsPreflightRequest,
): Promise<{ ok: boolean; blockers: string[] }> {
  return withSanContext(sanId, async () => {
    const manager = getSSHPool().get(sanId)
    if (!manager || manager.getStatus() !== 'connected') {
      return { ok: false, blockers: ['SSH non connecté'] }
    }
    const overview = await collectFsOverview(manager)
    const pre = await runFsPreflight(manager, overview, req)
    return { ok: pre.ok, blockers: pre.blockers }
  })
}

/** Primary-node preflight + typed confirmation before cluster fan-out. */
async function assertClusterPayloadPreflight(
  primarySanId: string,
  req: FsPreflightRequest,
  confirmation?: string,
): Promise<void> {
  const manager = getSSHPool().get(primarySanId)
  if (!manager || manager.getStatus() !== 'connected') {
    throw createError({ statusCode: 503, statusMessage: 'SSH non connecté sur le nœud primaire' })
  }
  const pre = await withSanContext(primarySanId, async () => {
    const overview = await collectFsOverview(manager)
    return runFsPreflight(manager, overview, req)
  })
  if (!pre.ok) {
    throw createError({
      statusCode: 422,
      statusMessage: pre.blockers.join(' · ') || 'Préflight échoué',
      data: { preflight: pre },
    })
  }
  if (confirmation?.trim() !== pre.requiredConfirmation) {
    throw createError({
      statusCode: 400,
      statusMessage: `Confirmation requise : ${pre.requiredConfirmation}`,
    })
  }
}

export async function executeClusterFsCreate(
  primarySanId: string,
  clusterId: string,
  payload: CreateFsPayload,
): Promise<ClusterFsExecutionResult> {
  await assertClusterPayloadPreflight(
    primarySanId,
    { action: 'create_fs', payload },
    payload.confirmation,
  )
  assertClusterNodesWritable(clusterId)
  const nodes = resolveClusterEnabledNodes(clusterId)
  const nodeResults: ClusterLvmNodeResult[] = []
  const errors: string[] = []

  for (const node of nodes) {
    const base: ClusterLvmNodeResult = { sanId: node.id, label: node.label, participation: 'failed' }
    const pre = await runPreflightOnNode(node.id, { action: 'create_fs', payload })
    if (!pre.ok) {
      errors.push(`${node.label}: ${pre.blockers.join(', ')}`)
      nodeResults.push({ ...base, error: pre.blockers.join(', ') })
      continue
    }
    const manager = getSSHPool().get(node.id)
    if (!manager) {
      errors.push(`${node.label}: SSH indisponible`)
      nodeResults.push({ ...base, error: 'SSH indisponible' })
      continue
    }
    try {
      await withSanContext(node.id, () => runCreateFilesystem(manager, payload))
      invalidateFsCaches(node.id)
      nodeResults.push({ ...base, participation: 'execute' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur'
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({ ...base, error: msg })
    }
  }

  const success = nodeResults.every(n => n.participation === 'execute')
  if (!success) {
    throw createError({
      statusCode: 409,
      statusMessage: errors.join(' · ') || 'Échec partiel cluster',
      data: { nodeResults, errors },
    })
  }
  return { success: true, nodeResults, errors }
}

export async function executeClusterVdiskCreate(
  primarySanId: string,
  clusterId: string,
  payload: CreateVdiskPayload,
): Promise<ClusterFsExecutionResult> {
  await assertClusterPayloadPreflight(
    primarySanId,
    { action: 'create_vdisk', payload },
    payload.confirmation,
  )
  assertClusterNodesWritable(clusterId)
  const nodes = resolveClusterEnabledNodes(clusterId)
  const nodeResults: ClusterLvmNodeResult[] = []
  const errors: string[] = []

  for (const node of nodes) {
    const base: ClusterLvmNodeResult = { sanId: node.id, label: node.label, participation: 'failed' }
    const pre = await runPreflightOnNode(node.id, { action: 'create_vdisk', payload })
    if (!pre.ok) {
      errors.push(`${node.label}: ${pre.blockers.join(', ')}`)
      nodeResults.push({ ...base, error: pre.blockers.join(', ') })
      continue
    }
    const manager = getSSHPool().get(node.id)
    if (!manager) {
      nodeResults.push({ ...base, error: 'SSH indisponible' })
      errors.push(`${node.label}: SSH`)
      continue
    }
    try {
      await withSanContext(node.id, () => runCreateVdisk(manager, payload))
      invalidateFsCaches(node.id)
      nodeResults.push({ ...base, participation: 'execute' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur'
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({ ...base, error: msg })
    }
  }

  const success = nodeResults.every(n => n.participation === 'execute')
  if (!success) {
    throw createError({ statusCode: 409, statusMessage: errors.join(' · '), data: { nodeResults } })
  }
  return { success, nodeResults, errors }
}

export async function executeClusterFileioBind(
  primarySanId: string,
  clusterId: string,
  payload: CreateFileioPayload,
): Promise<ClusterFsExecutionResult> {
  await assertClusterPayloadPreflight(
    primarySanId,
    { action: 'bind_fileio', payload },
    payload.confirmation,
  )
  assertClusterNodesWritable(clusterId)
  const nodes = resolveClusterEnabledNodes(clusterId)
  const nodeResults: ClusterLvmNodeResult[] = []
  const errors: string[] = []

  for (const node of nodes) {
    const base: ClusterLvmNodeResult = { sanId: node.id, label: node.label, participation: 'failed' }
    try {
      await withSanContext(node.id, async () => {
        const manager = getSSHPool().get(node.id)
        if (!manager) throw new Error('SSH indisponible')
        const overview = await collectFsOverview(manager)
        const pre = await runFsPreflight(manager, overview, { action: 'bind_fileio', payload })
        if (!pre.ok) throw new Error(pre.blockers.join(', '))
        await runBindFileio(payload)
        invalidateFsCaches(node.id)
      })
      nodeResults.push({ ...base, participation: 'execute' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur'
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({ ...base, error: msg })
    }
  }

  const success = nodeResults.every(n => n.participation === 'execute')
  if (!success) {
    throw createError({ statusCode: 409, statusMessage: errors.join(' · '), data: { nodeResults } })
  }
  return { success, nodeResults, errors }
}
