import { getActiveSSHManager } from '../../utils/ssh-runtime'
import { readPerfAgentService, readCompactionStatus } from '../../utils/perf-agent-service'
import { runReadWithSanScope } from '../../utils/san-request-context'

export default defineEventHandler(async (event) => {
  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const [service, compaction] = await Promise.all([
      readPerfAgentService(manager),
      readCompactionStatus(manager),
    ])
    return { ...service, compaction }
  }

  try {
    return await runReadWithSanScope(event, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      message: err.message ?? 'Erreur lecture service perf-agent',
    })
  }
})
