import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { controlPerfAgentService } from '../../utils/perf-agent-service'
import { requireSanIdQuery } from '../../utils/san-query'
import type { PerfServiceAction } from '../../utils/perf-agent-types'

const VALID_ACTIONS = new Set<PerfServiceAction>(['start', 'stop', 'restart', 'enable', 'disable'])

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<{ action: PerfServiceAction }>(event)

  if (!VALID_ACTIONS.has(body.action)) {
    throw createError({ statusCode: 400, statusMessage: `Action invalide: ${body.action}` })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    return controlPerfAgentService(manager, body.action)
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur action service perf-agent',
    })
  }
})
