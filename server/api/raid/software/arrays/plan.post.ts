/**
 * POST /api/raid/software/arrays/plan — Build a validated MD create execution plan without SSH writes.
 */
import { getActiveSSHManager, withSanContext } from '../../../../utils/ssh-runtime'
import { collectRaidOverview } from '../../../../utils/raid-overview.service'
import { buildMdCreateCommand, normalizeAndAssertMdCreateRequest, normalizeMdCreatePayload } from '../../../../utils/raid-md-validation'
import { requireSanIdQuery } from '../../../../utils/san-query'
import { getSanSummary } from '../../../../db/repositories/san.repository'
import { buildCreateMdArrayClusterExecutionPlan } from '../../../../utils/raid-cluster-storage-preflight'
import type { CreateMdArrayExecutionPlan, CreateMdArrayRequest } from '../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const san = getSanSummary(sanId)
  const body = await readBody<Partial<CreateMdArrayRequest>>(event)
  const request = normalizeMdCreatePayload({ ...body, chunkKb: body?.chunkKb ?? 64 })

  try {
    if (san?.clusterId) {
      if (!request.clusterExecution) {
        throw createError({ statusCode: 400, statusMessage: 'clusterExecution requis pour planifier la création MD cluster' })
      }
      if (request.clusterExecution.primarySanId !== sanId) {
        throw createError({ statusCode: 400, statusMessage: 'primarySanId doit correspondre au SAN courant' })
      }
      if (request.clusterExecution.clusterId && request.clusterExecution.clusterId !== san.clusterId) {
        throw createError({ statusCode: 400, statusMessage: 'clusterId ne correspond pas au SAN courant' })
      }
      const { nodeResults } = await buildCreateMdArrayClusterExecutionPlan(request)
      return createPlanResponse({
        mode: 'cluster',
        sourceSanId: request.clusterExecution.primarySanId,
        clusterId: request.clusterExecution.clusterId,
        request,
        nodeResults,
      })
    }

    return await withSanContext(sanId, async () => {
      const manager = getActiveSSHManager()
      if (!manager?.isReady()) {
        throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      }
      const overview = await collectRaidOverview(manager)
      const normalized = normalizeAndAssertMdCreateRequest(request, overview.blockDevices, overview.mdArrays)
      const command = buildMdCreateCommand(normalized)
      return createPlanResponse({
        mode: 'standalone',
        sourceSanId: sanId,
        request: normalized,
        nodeResults: [{
          sanId,
          label: san?.label ?? sanId,
          role: san?.clusterRole ?? null,
          source: 'primary',
          devices: normalized.devices,
          command,
          status: 'pending',
        }],
      })
    })
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur planification création MD array',
      data: err.data,
    })
  }
})

function createPlanResponse(input: Omit<CreateMdArrayExecutionPlan, 'normalized'> & { request: CreateMdArrayRequest }): CreateMdArrayExecutionPlan {
  const plan: CreateMdArrayExecutionPlan = {
    mode: input.mode,
    sourceSanId: input.sourceSanId,
    clusterId: input.clusterId,
    nodeResults: input.nodeResults,
    normalized: {
      name: input.request.name,
      level: input.request.level,
      chunkKb: input.request.chunkKb,
      devices: input.request.devices,
      raidDevices: input.request.devices.length,
    },
  }
  if (process.env.NODE_ENV === 'development') {
    console.info('[raid-md] create plan', plan.normalized)
  }
  return plan
}
