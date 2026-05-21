import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getDB } from '../db'
import { sans } from '../db/schema'
import { getSSHPool } from './ssh-pool'
import { withSanContext } from './ssh-runtime'
import { invalidateCacheKey } from './cache'
import {
  createGroup,
  deleteGroup,
  addInitiator,
  removeInitiator,
  addLunToGroup,
  removeLunFromGroup,
} from './scst-config-writer'
import type { InitiatorType } from '~/utils/scst-initiator-validation'
import type { ClusterLvmNodeResult } from '~/types/lvm'

export type ScstClusterMutationResult = {
  success: boolean
  nodeResults: ClusterLvmNodeResult[]
  errors: string[]
  refreshedSanIds: string[]
}

type ClusterNodeRow = {
  id: string
  label: string
  readOnly: boolean
}

function resolveClusterNodes(clusterId: string): ClusterNodeRow[] {
  return getDB()
    .select({
      id: sans.id,
      label: sans.label,
      readOnly: sans.readOnly,
    })
    .from(sans)
    .where(and(eq(sans.clusterId, clusterId), eq(sans.clusterEnabled, true)))
    .all()
}

function logScstCluster(nodeLabel: string, action: string, ok: boolean, detail?: string) {
  const prefix = `[scst/cluster] node=${nodeLabel} action=${action}`
  if (ok) console.log(`${prefix} ok`)
  else console.error(`${prefix} error=${detail ?? 'unknown'}`)
}

async function runOnClusterNodes(
  clusterId: string,
  action: string,
  run: (targetName: string) => Promise<void>,
  targetName: string,
): Promise<ScstClusterMutationResult> {
  const nodes = resolveClusterNodes(clusterId)
  const nodeResults: ClusterLvmNodeResult[] = []
  const errors: string[] = []
  const refreshedSanIds = new Set<string>()

  for (const node of nodes) {
    const base: ClusterLvmNodeResult = {
      sanId: node.id,
      label: node.label,
      participation: 'failed',
    }

    if (node.readOnly) {
      const msg = 'lecture seule'
      logScstCluster(node.label, action, false, msg)
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({ ...base, error: msg })
      continue
    }

    const manager = getSSHPool().get(node.id)
    if (!manager || manager.getStatus() !== 'connected') {
      const msg = 'connexion SSH indisponible'
      logScstCluster(node.label, action, false, msg)
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({ ...base, error: msg })
      continue
    }

    try {
      await withSanContext(node.id, async () => {
        await run(targetName)
        logScstCluster(node.label, action, true)
        nodeResults.push({
          sanId: node.id,
          label: node.label,
          participation: 'execute',
          command: action,
          exitCode: 0,
        })
        refreshedSanIds.add(node.id)
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur SCST'
      logScstCluster(node.label, action, false, msg)
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({ ...base, command: action, error: msg, stderr: msg })
    }
  }

  for (const id of refreshedSanIds) invalidateCacheKey('overview')

  const executeCount = nodeResults.filter(n => n.participation === 'execute').length
  return {
    success: executeCount > 0 && errors.length === 0
      && nodeResults.every(n => n.participation === 'execute'),
    nodeResults,
    errors,
    refreshedSanIds: [...refreshedSanIds],
  }
}

export async function clusterCreateGroup(
  clusterId: string,
  targetName: string,
  groupName: string,
): Promise<ScstClusterMutationResult> {
  return runOnClusterNodes(clusterId, `createGroup ${groupName}`, async (t) => {
    await createGroup(t, groupName)
  }, targetName)
}

export async function clusterDeleteGroup(
  clusterId: string,
  targetName: string,
  groupName: string,
  force?: boolean,
): Promise<ScstClusterMutationResult> {
  return runOnClusterNodes(clusterId, `deleteGroup ${groupName}`, async (t) => {
    await deleteGroup(t, groupName, { force })
  }, targetName)
}

export async function clusterAddInitiator(
  clusterId: string,
  targetName: string,
  groupName: string,
  initiator: string,
  type?: InitiatorType,
): Promise<ScstClusterMutationResult & { initiator?: string }> {
  let normalized: string | undefined
  const result = await runOnClusterNodes(
    clusterId,
    `addInitiator ${groupName}`,
    async (t) => {
      const r = await addInitiator(t, groupName, initiator, { type: type ?? 'auto' })
      normalized = r.initiator
    },
    targetName,
  )
  return { ...result, initiator: normalized }
}

export async function clusterRemoveInitiator(
  clusterId: string,
  targetName: string,
  groupName: string,
  initiator: string,
): Promise<ScstClusterMutationResult> {
  return runOnClusterNodes(clusterId, `removeInitiator ${groupName}`, async (t) => {
    await removeInitiator(t, groupName, initiator)
  }, targetName)
}

export async function clusterAddLunToGroup(
  clusterId: string,
  targetName: string,
  groupName: string,
  lunId: number,
  deviceName: string,
  readOnly?: boolean,
): Promise<ScstClusterMutationResult> {
  return runOnClusterNodes(
    clusterId,
    `addLun ${groupName}/${lunId}`,
    async (t) => {
      await addLunToGroup(t, groupName, lunId, deviceName, { readOnly })
    },
    targetName,
  )
}

export async function clusterRemoveLunFromGroup(
  clusterId: string,
  targetName: string,
  groupName: string,
  lunId: number,
): Promise<ScstClusterMutationResult> {
  return runOnClusterNodes(
    clusterId,
    `removeLun ${groupName}/${lunId}`,
    async (t) => {
      await removeLunFromGroup(t, groupName, lunId)
    },
    targetName,
  )
}

export function assertScstClusterSuccess(result: ScstClusterMutationResult): void {
  if (result.success) return
  const statusCode = result.nodeResults.some(n => n.participation === 'execute') ? 409 : 422
  throw createError({
    statusCode,
    message: result.errors.join(' · ') || 'Mutation SCST cluster échouée',
    data: { nodeResults: result.nodeResults },
  })
}
