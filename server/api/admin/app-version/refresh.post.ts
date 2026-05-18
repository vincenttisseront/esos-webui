/**
 * POST /api/admin/app-version/refresh — Recalcule la version runtime et la réécrit en base (SDD v3.13 §10.3).
 * Admin only (RBAC: /api/admin/ POST → admin+operator, garde explicite admin seul ici).
 *
 * Utilise `resolveRuntimeAppVersion()` (mêmes règles que le plugin de démarrage).
 */
import { getAppVersion, getDbSchemaVersion, upsertAppVersion } from '../../../db/repositories/app-version.repository'
import { resolveRuntimeAppVersion } from '../../../utils/app-version'

export default defineEventHandler((event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Accès réservé aux administrateurs.' })
  }

  const runtime = resolveRuntimeAppVersion()
  runtime.dbSchemaVersion = getDbSchemaVersion()
  return upsertAppVersion(runtime, 'manual')
})
