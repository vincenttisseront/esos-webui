import { getActiveSSHManager } from '../../utils/ssh-runtime'
import { readPerfAgentConfig } from '../../utils/perf-agent-config'
import { runReadWithSanScope } from '../../utils/san-request-context'

export default defineEventHandler(async (event) => {
  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    return readPerfAgentConfig(manager)
  }

  try {
    return await runReadWithSanScope(event, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      message: err.message ?? 'Erreur lecture configuration perf-agent',
    })
  }
})
