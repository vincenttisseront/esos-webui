import { runClusterStoragePreflight } from '../../../utils/raid-cluster-storage-preflight'
import type { ClusterStoragePreflightRequest } from '../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const body = await readBody<ClusterStoragePreflightRequest>(event)
  if (!body?.primarySanId || !body?.action || !body?.payload) {
    throw createError({ statusCode: 400, statusMessage: 'primarySanId, action et payload requis' })
  }

  try {
    return await runClusterStoragePreflight(body)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur préflight stockage cluster',
    })
  }
})
