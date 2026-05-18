import { createPerfAgentAdapter, invalidatePerfSchemaCache } from '../../utils/perf-agent-db'
import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { readRawDbUri } from '../../utils/perf-agent-config'
import { requireSanIdQuery } from '../../utils/san-query'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)

  const getDbUri = async () => {
    const run = async () => {
      const manager = getActiveSSHManager()
      if (!manager?.isReady()) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      return readRawDbUri(manager)
    }
    return withSanContext(sanId, run)
  }

  try {
    const dburi = await getDbUri()
    if (!dburi) {
      return { ok: false, dbType: 'unknown', error: 'Aucun DBURI configuré' }
    }
    invalidatePerfSchemaCache()
    const adapter = createPerfAgentAdapter(dburi)
    return await adapter.test()
  } catch (err: any) {
    if (err.statusCode) throw err
    return { ok: false, dbType: 'unknown', error: err.message }
  }
})
