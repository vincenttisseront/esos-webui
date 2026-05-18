import { createPerfAgentAdapter, windowToMs } from '../../utils/perf-agent-db'
import { getActiveSSHManager } from '../../utils/ssh-runtime'
import { readRawDbUri } from '../../utils/perf-agent-config'
import { runReadWithSanScope } from '../../utils/san-request-context'

const VALID_WINDOWS = new Set(['15m', '1h', '6h', '24h', '7d', '31d'])

export default defineEventHandler(async (event) => {
  const { system, device, window = '1h' } = getQuery(event) as {
    sanId?: string
    system?: string
    device?: string
    window?: string
  }

  if (!system) throw createError({ statusCode: 400, message: 'Paramètre system requis' })
  if (!device) throw createError({ statusCode: 400, message: 'Paramètre device requis' })
  if (!VALID_WINDOWS.has(window)) throw createError({ statusCode: 400, message: `Fenêtre invalide: ${window}` })

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
      const to = Date.now()
      const from = to - windowToMs(window)
      return await adapter.getSeries({ system, device, window, from, to })
    })
  } catch (err: any) {
    if (err.statusCode) throw err
    throw createError({ statusCode: 502, message: `Erreur DB: ${err.message}` })
  }
})
