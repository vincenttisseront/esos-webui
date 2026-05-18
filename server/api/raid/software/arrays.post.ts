/**
 * POST /api/raid/software/arrays — Créer un MD array (SDD v3.12 §8.4).
 */
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import { createMdArrayFromPlan } from '../../../utils/raid-md-actions'
import { collectRaidOverview } from '../../../utils/raid-overview.service'
import { buildMdCreateCommand, expectedMdCreateConfirmation, MD_RAID_LEVELS, normalizeAndAssertMdCreateRequest, normalizeMdCreatePayload } from '../../../utils/raid-md-validation'
import { invalidateCacheKey } from '../../../utils/cache'
import { requireSanIdQuery } from '../../../utils/san-query'
import { getSanSummary } from '../../../db/repositories/san.repository'
import { buildCreateMdArrayClusterExecutionPlan } from '../../../utils/raid-cluster-storage-preflight'
import type { CreateMdArrayClusterExecutionResult, CreateMdArrayNodeResult, CreateMdArrayRequest } from '../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const san = getSanSummary(sanId)
  const body = await readBody<CreateMdArrayRequest>(event)
  traceMdCreateEndpoint('payload-received', sanId, body)

  if (!body?.name || !body?.level) {
    throw createError({ statusCode: 400, statusMessage: 'name et level requis' })
  }
  if (!MD_RAID_LEVELS.includes(body.level as any)) {
    throw createError({ statusCode: 400, statusMessage: `Niveau RAID invalide : ${body.level}` })
  }
  if (!body.confirmation) {
    throw createError({ statusCode: 400, statusMessage: 'confirmation requise' })
  }
  const expectedConfirm = expectedMdCreateConfirmation(body.name)
  if (body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }
  const request = normalizeMdCreatePayload({ ...body, chunkKb: body.chunkKb ?? 64 })
  traceMdCreateEndpoint('payload-normalized', sanId, request)

  if (san?.clusterId) {
    if (!request.clusterExecution) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Création MD bloquée pour SAN clusterisé : validez le stockage sur tous les nœuds et utilisez le flux multi-nœud. Sync config ne crée pas les superblocks MD sur les pairs.',
      })
    }
    if (request.clusterExecution.primarySanId !== sanId) {
      throw createError({ statusCode: 400, statusMessage: 'primarySanId doit correspondre au SAN courant' })
    }
    if (request.clusterExecution.clusterId && request.clusterExecution.clusterId !== san.clusterId) {
      throw createError({ statusCode: 400, statusMessage: 'clusterId ne correspond pas au SAN courant' })
    }
    try {
      return await runClusterCreateMdArray(sanId, request)
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode ?? 500,
        statusMessage: err.statusMessage ?? err.message ?? 'Erreur création MD array cluster',
        data: err.data,
      })
    }
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const overview = await collectRaidOverview(manager)
    const req = normalizeAndAssertMdCreateRequest(request, overview.blockDevices, overview.mdArrays)
    const result = await createMdArrayFromPlan(manager, req, undefined, {
      endpoint: 'POST /api/raid/software/arrays',
      sanId,
      nodeLabel: san?.label ?? sanId,
    })
    invalidateCacheKey(`raid-overview-${sanId}`)
    return result
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur création MD array',
      data: err.data,
    })
  }
})

async function runClusterCreateMdArray(sanId: string, body: CreateMdArrayRequest) {
  const { nodeResults } = await buildCreateMdArrayClusterExecutionPlan(body)
  const refreshedSanIds = new Set<string>()
  const clusterExecution: CreateMdArrayClusterExecutionResult = {
    mode: 'cluster',
    clusterId: body.clusterExecution?.clusterId,
    sourceSanId: body.clusterExecution!.primarySanId,
    stopOnFirstFailure: true,
    nodeResults,
    refreshedSanIds: [],
  }

  for (const node of nodeResults) {
    if (!node.command) {
      node.status = 'failed'
      node.error = 'Commande MD planifiée manquante'
      clusterExecution.failedSanId = node.sanId
      clusterExecution.refreshedSanIds = [...refreshedSanIds]
      throw createError({
        statusCode: 400,
        statusMessage: `${node.label} : ${node.error}`,
        data: { clusterExecution },
      })
    }
    node.status = 'running'
    try {
      const result = await withSanContext(node.sanId, async () => {
        const manager = getActiveSSHManager()
        if (!manager?.isReady()) {
          throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
        }
        const overview = await collectRaidOverview(manager)
        const nodeReq: CreateMdArrayRequest = {
          ...body,
          devices: node.devices,
          clusterExecution: undefined,
        }
        const normalizedNodeReq = normalizeAndAssertMdCreateRequest(nodeReq, overview.blockDevices, overview.mdArrays)
        const rebuiltCommand = buildMdCreateCommand(normalizedNodeReq)
        traceMdCreateNode('node-command-verified', node, normalizedNodeReq, node.command, rebuiltCommand)
        if (rebuiltCommand !== node.command) {
          throw createError({
            statusCode: 400,
            statusMessage: `Commande MD planifiée différente de la commande d'exécution : ${node.command} != ${rebuiltCommand}`,
          })
        }
        return await createMdArrayFromPlan(manager, normalizedNodeReq, node.command, {
          endpoint: 'POST /api/raid/software/arrays',
          sanId: node.sanId,
          nodeLabel: node.label,
        })
      })
      node.command = result.command
      node.stdout = result.stdout
      node.persisted = result.persisted
      node.status = 'success'
      refreshedSanIds.add(node.sanId)
      invalidateCacheKey(`raid-overview-${node.sanId}`)
    } catch (err: any) {
      const errorData = err?.data ?? {}
      node.status = 'failed'
      node.command = typeof errorData.command === 'string' ? errorData.command : node.command
      node.stdout = typeof errorData.stdout === 'string' ? errorData.stdout : node.stdout
      node.stderr = typeof errorData.stderr === 'string' ? errorData.stderr : node.stderr
      node.error = err?.statusMessage ?? err?.message ?? 'Erreur création MD array'
      traceMdCreateNodeFailure(node, node.command, node.error, node.stdout, node.stderr)
      clusterExecution.failedSanId = node.sanId
      clusterExecution.refreshedSanIds = [...refreshedSanIds]
      throw createError({
        statusCode: err?.statusCode ?? 500,
        statusMessage: `${node.label} : ${node.error}`,
        data: { clusterExecution },
      })
    }
  }

  clusterExecution.refreshedSanIds = [...refreshedSanIds]
  return {
    mode: 'cluster' as const,
    stdout: nodeResults.map(n => `[${n.label}]\n${n.stdout ?? ''}`).join('\n'),
    command: nodeResults.map(n => `[${n.label}] ${n.command ?? ''}`).join('\n'),
    persisted: nodeResults.every(n => n.persisted),
    refreshed: true,
    refreshedSanIds: clusterExecution.refreshedSanIds,
    clusterExecution,
  }
}

function traceMdCreateEndpoint(event: string, sanId: string, req: Partial<CreateMdArrayRequest> | null | undefined): void {
  const devices = Array.isArray(req?.devices) ? req.devices.map(device => String(device)) : []
  console.info('[raid-md:create:endpoint]', {
    event,
    endpoint: 'POST /api/raid/software/arrays',
    sanId,
    arrayName: req?.name,
    level: req?.level,
    chunkKb: req?.chunkKb,
    membersLength: devices.length,
    members: devices,
    clusterId: req?.clusterExecution?.clusterId,
    primarySanId: req?.clusterExecution?.primarySanId,
    mappingCount: req?.clusterExecution?.diskMappings?.length ?? 0,
  })
}

function traceMdCreateNode(
  event: string,
  node: CreateMdArrayNodeResult,
  req: CreateMdArrayRequest,
  plannedCommand: string,
  rebuiltCommand: string,
): void {
  console.info('[raid-md:create:node]', {
    event,
    endpoint: 'POST /api/raid/software/arrays',
    sanId: node.sanId,
    nodeLabel: node.label,
    arrayName: req.name,
    level: req.level,
    chunkKb: req.chunkKb,
    membersLength: req.devices.length,
    members: req.devices,
    plannedCommand,
    rebuiltCommand,
    finalCommand: rebuiltCommand,
  })
}

function traceMdCreateNodeFailure(
  node: CreateMdArrayNodeResult,
  finalCommand: string | undefined,
  errorMessage: string,
  stdout?: string,
  stderr?: string,
): void {
  console.info('[raid-md:create:node]', {
    event: 'node-exec-failed',
    endpoint: 'POST /api/raid/software/arrays',
    sanId: node.sanId,
    nodeLabel: node.label,
    finalCommand,
    errorMessage,
    stdout,
    stderr,
  })
}
