import { getDB } from '../db'
import { seedAdminIfNeeded } from '../utils/admin-seed'
import { ensureAuthProviderDefaultSettings } from '../utils/auth-providers-config'

/**
 * Initialise la base SQLite + crée l'admin par défaut au 1er boot
 * (cf. SDD v2.0 §5 + SDD v2.1 §8).
 *
 * Le préfixe `0.` du nom de fichier garantit l'ordre alphabétique
 * (Nitro charge les plugins par ordre de nom).
 */
export default defineNitroPlugin(async () => {
  try {
    getDB()
    console.log('[DB] Base de données initialisée.')
    await seedAdminIfNeeded()
    await ensureAuthProviderDefaultSettings()
  } catch (err) {
    console.error('[DB] Erreur fatale d\'initialisation :', (err as Error).message)
    process.exit(1)
  }
})
