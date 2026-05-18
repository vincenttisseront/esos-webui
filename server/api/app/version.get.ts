/**
 * GET /api/app/version — Version globale de l'application WebUI (SDD v3.13 §10.1).
 * Route publique (authentifiée mais pas admin-only).
 */
import { getAppVersion } from '../../db/repositories/app-version.repository'
import { resolveRuntimeAppVersion } from '../../utils/app-version'

export default defineEventHandler(() => {
  try {
    const stored = getAppVersion()
    if (stored) return stored
  } catch {
    // DB indisponible — retour version transient
  }

  return {
    ...resolveRuntimeAppVersion(),
    id: 'global',
    updatedAt: new Date().toISOString(),
    transient: true,
  }
})
