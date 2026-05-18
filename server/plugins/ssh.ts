import { readFileSync, statSync } from 'node:fs'
import type { NitroApp } from 'nitropack'
import { initSSHManager, getSSHManager } from '../utils/ssh-session-manager'
import { getSSHPool } from '../utils/ssh-pool'
import { getAllSans } from '../db/repositories/san.repository'

/**
 * Plugin SSH (cf. SDD v2.0 §12).
 *
 * Stratégie :
 *   - Si BDD contient ≥1 SAN actif → mode multi-SAN via `SSHPool`.
 *   - Sinon → fallback v1 via `initSSHManager()` (variables NUXT_SSH_*).
 */
export default defineNitroPlugin(async (nitroApp) => {
  let sans: ReturnType<typeof getAllSans> = []
  try {
    sans = getAllSans()
  } catch (err) {
    console.error('[SSH] Lecture BDD échouée :', (err as Error).message)
  }

  const activeSans = sans.filter((s) => s.status === 'active')

  if (activeSans.length === 0) {
    console.log(
      '[SSH] Aucun SAN actif en BDD — mode v1 (variables d\'environnement).',
    )
    initFromEnv(nitroApp)
    return
  }

  console.log(`[SSH] Mode multi-SAN — ${activeSans.length} SAN(s) actif(s).`)
  const pool = getSSHPool()

  for (const san of activeSans) {
    try {
      await pool.getOrCreate(san.id)
      console.log(`[SSH] Pool init: ${san.id} (${san.label})`)
    } catch (err) {
      console.error(
        `[SSH] Échec connexion ${san.id} (${san.label}):`,
        (err as Error).message,
      )
    }
  }

  nitroApp.hooks.hook('close', () => {
    pool.destroyAll()
  })
})

function initFromEnv(nitroApp: NitroApp): void {
  const cfg = useRuntimeConfig()

  const host = cfg.sshHost || ''
  const username = cfg.sshUser || ''
  if (!host || !username) {
    console.error(
      '[SSH Plugin] Missing NUXT_SSH_HOST / NUXT_SSH_USER — SSH disabled.',
    )
    return
  }

  let privateKey: Buffer | undefined
  if (cfg.sshPrivateKey) {
    privateKey = Buffer.from(cfg.sshPrivateKey, 'base64')
  } else if (cfg.sshKeyPath) {
    try {
      const stat = statSync(cfg.sshKeyPath)
      if (stat.isFile()) {
        privateKey = readFileSync(cfg.sshKeyPath)
      } else {
        console.error(
          `[SSH Plugin] SSH key path is not a file: ${cfg.sshKeyPath}`,
        )
      }
    } catch (err) {
      console.error(
        `[SSH Plugin] Cannot read key at ${cfg.sshKeyPath}:`,
        (err as Error).message,
      )
    }
  }

  const manager = initSSHManager({
    host,
    port: Number(cfg.sshPort) || 22,
    username,
    privateKey,
    password: cfg.sshPassword || undefined,
    readyTimeout: 10_000,
  })

  manager.on('status', (status) => {
    console.log(`[SSH] Status: ${status}`)
  })

  nitroApp.hooks.hook('close', () => {
    try {
      getSSHManager().destroy()
    } catch {
      /* ignore */
    }
  })
}
