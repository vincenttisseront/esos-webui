import { logBinariesStorageStartupCheck } from '../utils/deployment-binaries-storage'

/**
 * Warn at startup when the binary catalog directory is not writable.
 */
export default defineNitroPlugin(() => {
  void logBinariesStorageStartupCheck().catch((err) => {
    console.warn('[binaries] Échec du contrôle de stockage au démarrage:', (err as Error).message)
  })
})
