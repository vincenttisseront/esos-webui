/**
 * POST /api/raid/software/partitions/prepare — Préparer des partitions Linux RAID.
 */
import { randomUUID } from 'node:crypto'
import { getActiveSSHManager, withSanContext } from '../../../../utils/ssh-runtime'
import { collectRaidOverview } from '../../../../utils/raid-overview.service'
import { invalidateCacheKey } from '../../../../utils/cache'
import { requireSanIdQuery } from '../../../../utils/san-query'
import { getSanSummary } from '../../../../db/repositories/san.repository'
import {
  assertValidPrepareMdPartitionsRequest,
  prepareMdPartitions,
  PREPARE_MD_PARTITIONS_CONFIRMATION,
} from '../../../../utils/raid-md-partition-actions'
import { buildPrepareMdPartitionsClusterExecutionPlan } from '../../../../utils/raid-cluster-storage-preflight'
import { addRaidOperation, updateRaidOperation } from '../../../../utils/raid-operations-store'
import type {
  PrepareMdPartitionsClusterExecutionResult,
  PrepareMdPartitionsNodePlan,
  PrepareMdPartitionsRequest,
  RaidOperation,
  RaidOperationStep,
} from '../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const san = getSanSummary(sanId)
  const body = await readBody<PrepareMdPartitionsRequest>(event)

  if (!body?.disks?.length) {
    throw createError({ statusCode: 400, statusMessage: 'disks requis' })
  }
  if (body.confirmation !== PREPARE_MD_PARTITIONS_CONFIRMATION) {
    throw createError({
      statusCode: 400,
      statusMessage: `Confirmation invalide (attendu : "${PREPARE_MD_PARTITIONS_CONFIRMATION}")`,
    })
  }

  if (san?.clusterId) {
    if (!body.clusterExecution) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Préparation de partitions RAID bloquée pour SAN clusterisé : validez le stockage sur tous les nœuds et utilisez le flux multi-nœud. Sync config ne crée pas les partitions sur les pairs.',
      })
    }
    if (body.clusterExecution.primarySanId !== sanId) {
      throw createError({ statusCode: 400, statusMessage: 'primarySanId doit correspondre au SAN courant' })
    }
    if (body.clusterExecution.clusterId && body.clusterExecution.clusterId !== san.clusterId) {
      throw createError({ statusCode: 400, statusMessage: 'clusterId ne correspond pas au SAN courant' })
    }
    try {
      return await runClusterPrepareMdPartitions(sanId, body)
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode ?? 500,
        statusMessage: err.statusMessage ?? err.message ?? 'Erreur préparation partitions RAID cluster',
        data: err.data,
      })
    }
  }

  const runStandalone = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }

    const overview = await collectRaidOverview(manager)
    const validation = assertValidPrepareMdPartitionsRequest(body, overview.blockDevices, overview.tools)
    const opId = randomUUID()
    const op: RaidOperation = {
      id: opId,
      sanId,
      backend: 'software_md',
      action: 'prepare_md_partitions',
      riskLevel: 'destructive',
      status: 'running',
      createdAt: Date.now(),
      startedAt: Date.now(),
      createdBy: 'webui',
      summary: `Préparation partitions RAID sur ${body.disks.join(', ')}`,
      preflight: {
        ok: true,
        riskLevel: 'destructive',
        blockers: [],
        warnings: validation.warnings,
        requiredConfirmation: PREPARE_MD_PARTITIONS_CONFIRMATION,
        impactedDevices: validation.impactedDevices,
        detectedUsage: validation.detectedUsage,
        commandPreview: validation.commandPreview,
        partitionTableRequested: validation.partitionTableRequested,
        partitionTableResolved: validation.partitionTableResolved,
        diskChecks: validation.diskChecks,
        preparedPartitionPreview: validation.preparedPartitionPreview,
      },
      steps: validation.commands.map((command, index) => ({
        id: `cmd-${index + 1}`,
        label: `Commande ${index + 1}`,
        command,
        status: 'planned',
      })),
    }
    addRaidOperation(op)

    try {
      updateRaidOperation(opId, {
        steps: op.steps.map(s => ({ ...s, status: 'running' })),
      })
      const result = await prepareMdPartitions(manager, body, validation)
      invalidateCacheKey(`raid-overview-${sanId}`)
      updateRaidOperation(opId, {
        status: 'success',
        finishedAt: Date.now(),
        steps: op.steps.map(s => ({ ...s, status: 'success' })),
      })
      return { ...result, mode: 'standalone' as const, refreshed: true, refreshedSanIds: [sanId], operationId: opId }
    } catch (err: any) {
      updateRaidOperation(opId, {
        status: 'failed',
        finishedAt: Date.now(),
        error: err?.statusMessage ?? err?.message ?? 'Erreur préparation partitions RAID',
        steps: op.steps.map(s => ({ ...s, status: 'failed' })),
      })
      throw err
    }
  }

  try {
    return await withSanContext(sanId, runStandalone)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur préparation partitions RAID',
      data: err.data,
    })
  }
})

async function runClusterPrepareMdPartitions(
  sanId: string,
  body: PrepareMdPartitionsRequest,
) {
  const { preflight, nodePlans } = await buildPrepareMdPartitionsClusterExecutionPlan(body)
  const opId = randomUUID()
  const refreshedSanIds = new Set<string>()
  const clusterExecution: PrepareMdPartitionsClusterExecutionResult = {
    mode: 'cluster',
    clusterId: body.clusterExecution?.clusterId,
    sourceSanId: body.clusterExecution!.primarySanId,
    stopOnFirstFailure: true,
    nodePlans,
    refreshedSanIds: [],
  }
  const op: RaidOperation = {
    id: opId,
    sanId,
    backend: 'software_md',
    action: 'prepare_md_partitions_cluster',
    riskLevel: 'destructive',
    status: 'running',
    createdAt: Date.now(),
    startedAt: Date.now(),
    createdBy: 'webui',
    summary: `Préparation partitions RAID cluster sur ${nodePlans.length} nœuds`,
    preflight: {
      ...(preflight.perNodePreflights[sanId] ?? nodePlans[0]!.preflight),
      warnings: [...new Set(preflight.warnings)],
    },
    steps: toOperationSteps(nodePlans),
  }
  addRaidOperation(op)

  try {
    for (const nodePlan of nodePlans) {
      setNodeStatus(nodePlans, nodePlan.sanId, 'running')
      updateRaidOperation(opId, { steps: toOperationSteps(nodePlans) })

      try {
        const nodeResult = await withSanContext(nodePlan.sanId, async () => {
          const manager = getActiveSSHManager()
          if (!manager?.isReady()) {
            throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
          }
          const overview = await collectRaidOverview(manager)
          const nodeReq: PrepareMdPartitionsRequest = {
            ...body,
            disks: nodePlan.disks,
            clusterExecution: undefined,
          }
          const validation = assertValidPrepareMdPartitionsRequest(nodeReq, overview.blockDevices, overview.tools)
          nodePlan.commands = validation.commands
          nodePlan.preparedPartitions = validation.preparedPartitionPreview.map(p => p.expectedPartitionPath)
          refreshedSanIds.add(nodePlan.sanId)
          return await prepareMdPartitions(manager, nodeReq, validation)
        })
        nodePlan.stdout = nodeResult.stdout
        nodePlan.status = 'success'
        invalidateCacheKey(`raid-overview-${nodePlan.sanId}`)
        updateRaidOperation(opId, { steps: toOperationSteps(nodePlans) })
      } catch (err: any) {
        nodePlan.status = 'failed'
        nodePlan.stdout = err?.data?.stdout
        nodePlan.stderr = err?.data?.stderr
        nodePlan.error = err?.statusMessage ?? err?.message ?? 'Erreur préparation partitions RAID'
        if (refreshedSanIds.has(nodePlan.sanId)) {
          invalidateCacheKey(`raid-overview-${nodePlan.sanId}`)
        }
        clusterExecution.failedSanId = nodePlan.sanId
        clusterExecution.refreshedSanIds = [...refreshedSanIds]
        updateRaidOperation(opId, {
          status: 'failed',
          finishedAt: Date.now(),
          error: `${nodePlan.label} : ${nodePlan.error}`,
          steps: toOperationSteps(nodePlans),
        })
        throw createError({
          statusCode: err?.statusCode ?? 500,
          statusMessage: `${nodePlan.label} : ${nodePlan.error}`,
          data: { operationId: opId, clusterExecution },
        })
      }
    }

    clusterExecution.refreshedSanIds = [...refreshedSanIds]
    updateRaidOperation(opId, {
      status: 'success',
      finishedAt: Date.now(),
      steps: toOperationSteps(nodePlans),
    })
    return {
      mode: 'cluster' as const,
      stdout: nodePlans.map(n => `[${n.label}]\n${n.stdout ?? ''}`).join('\n'),
      commands: nodePlans.flatMap(n => n.commands),
      preparedPartitions: nodePlans.flatMap(n => n.preparedPartitions),
      refreshed: true,
      refreshedSanIds: clusterExecution.refreshedSanIds,
      operationId: opId,
      clusterExecution,
    }
  } catch (err) {
    throw err
  }
}

function setNodeStatus(
  nodePlans: PrepareMdPartitionsNodePlan[],
  sanId: string,
  status: PrepareMdPartitionsNodePlan['status'],
): void {
  const node = nodePlans.find(n => n.sanId === sanId)
  if (node) node.status = status
}

function toOperationSteps(nodePlans: PrepareMdPartitionsNodePlan[]): RaidOperationStep[] {
  return nodePlans.flatMap(node =>
    node.commands.map((command, index) => ({
      id: `${node.sanId}-cmd-${index + 1}`,
      label: `${node.label} — Commande ${index + 1}`,
      command,
      status: node.status === 'pending' ? 'planned' : node.status,
      stdoutPreview: node.stdout?.slice(0, 500),
      stderrPreview: node.error,
    })),
  )
}
