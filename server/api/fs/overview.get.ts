import { resolveScopedSanIdForRead } from '../../utils/san-request-context'
import { withFsOverview } from '../../utils/fs-api-helpers'

export default defineEventHandler(async (event) => {
  const { refresh } = getQuery(event) as { refresh?: string }
  const scopeId = resolveScopedSanIdForRead(event)
  if (!scopeId) {
    throw createError({ statusCode: 400, statusMessage: 'sanId requis' })
  }
  try {
    return await withFsOverview(scopeId, refresh === '1', async o => o)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 503,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur scan filesystem',
    })
  }
})
