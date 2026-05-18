/**
 * Plugin Nitro — Persistance de la version applicative (SDD v3.13 §9).
 *
 * S'exécute APRÈS `0.database.ts` (préfixe `1.`).
 * Ne bloque jamais le démarrage en cas d'erreur.
 *
 * La version affichée / persistée est celle de `resolveRuntimeAppVersion()`
 * (sentinel `0.0.0-dev` ignoré en production au profit de `package.json`).
 */
import { resolveRuntimeAppVersion } from '../utils/app-version'
import { getDbSchemaVersion, upsertAppVersion } from '../db/repositories/app-version.repository'

export default defineNitroPlugin(() => {
  try {
    const runtime = resolveRuntimeAppVersion()
    runtime.dbSchemaVersion = getDbSchemaVersion()
    upsertAppVersion(runtime, 'startup')
    console.info(`[AppVersion] ${runtime.version} build=${runtime.build ?? 'n/a'} db=${runtime.dbSchemaVersion}`)
  } catch (err) {
    console.error('[AppVersion] Failed to persist app version:', err)
  }
})
