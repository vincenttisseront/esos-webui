import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import {
  readPerfAgentConfig,
  readRawDbUri,
  writePerfAgentConfig,
  validatePerfAgentConfigUpdate,
} from '../../utils/perf-agent-config'
import { requireSanIdQuery } from '../../utils/san-query'
import type { PerfAgentConfigUpdate } from '../../utils/perf-agent-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<PerfAgentConfigUpdate>(event)

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const existingDbUri = await readRawDbUri(manager)
    validatePerfAgentConfigUpdate(body, !!existingDbUri)
    await writePerfAgentConfig(manager, body, existingDbUri)
    return readPerfAgentConfig(manager)
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur écriture configuration perf-agent',
    })
  }
})
