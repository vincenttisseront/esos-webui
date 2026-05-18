import { createPerfAgentAdapter } from '../../utils/perf-agent-db'
import { getActiveSSHManager } from '../../utils/ssh-runtime'
import { readRawDbUri } from '../../utils/perf-agent-config'
import { runReadWithSanScope } from '../../utils/san-request-context'

export default defineEventHandler(async (event) => {
  const { system } = getQuery(event) as { sanId?: string; system?: string }

  if (!system) {
    throw createError({ statusCode: 400, message: 'Paramètre system requis' })
  }

  try {
    return await runReadWithSanScope(event, async () => {
      const getDbUri = async () => {
        const manager = getActiveSSHManager()
        if (!manager?.isReady()) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
        return readRawDbUri(manager)
      }

      const dburi = await getDbUri()
      if (!dburi) throw createError({ statusCode: 503, message: 'Aucun DBURI configuré' })
      const adapter = createPerfAgentAdapter(dburi)
      return await adapter.getSummary(system)
    })
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 502, message: `Erreur DB: ${err.message}` })
  }
})
