import { defineNitroPlugin } from 'nitropack/runtime'
import { readSessionSnapshots, readDeviceSnapshots } from '../utils/io-stats-reader'
import { pushSessionSnapshots, pushDeviceSnapshots } from '../utils/metrics-store'
import { readHardwareOverview } from '../utils/hardware-reader'
import { insertSamples, purgeOldSamples } from '../db/repositories/metrics.repository'
import { getSetting } from '../db/repositories/settings.repository'
import { getSSHPool } from '../utils/ssh-pool'
import { hasConfiguredSSH, getActiveSSHManager, withSanContext } from '../utils/ssh-runtime'
import { getActiveSans } from '../utils/san-request-context'
import type { InsertSample } from '../db/repositories/metrics.repository'

// En mode v1 (pas de multi-SAN BDD), on utilise l'ID 'default'
const SAN_ID = process.env.DEFAULT_SAN_ID ?? 'default'

// Timers module-level pour pouvoir les recharger dynamiquement (cf. SDD v3.0 §10)
let collectTimer: ReturnType<typeof setInterval> | null = null
let purgeTimer:   ReturnType<typeof setInterval> | null = null
let currentRetentionMs = 24 * 3_600_000

// ─── Lecture config collecteur depuis BDD ─────────────────────────────────────

async function getCollectorConfig(): Promise<{
  enabled:     boolean
  intervalMs:  number
  retentionMs: number
}> {
  const [enabled, intervalSec, retentionHours] = await Promise.all([
    getSetting('collector.enabled'),
    getSetting('collector.interval_sec'),
    getSetting('collector.retention_hours'),
  ])
  return {
    enabled:     (enabled ?? 'true') === 'true',
    intervalMs:  parseInt(intervalSec   ?? '30', 10) * 1000,
    retentionMs: parseInt(retentionHours ?? '24', 10) * 3_600_000,
  }
}

/**
 * Lit SCST + hardware via le SSH manager actif (contexte AsyncLocalStorage si multi-SAN).
 * `sanId` sert à la fois aux clés ring-buffer et aux colonnes metric_samples.
 */
async function gatherSamplesForSan(sanId: string): Promise<InsertSample[]> {
  const samples: InsertSample[] = []
  const now = Date.now()

  const sessionSnaps  = await readSessionSnapshots()
  const sessionThrpts = pushSessionSnapshots(sessionSnaps, sanId)

  for (const s of sessionThrpts) {
    samples.push(
      { sanId, timestamp: now, category: 'session', subject: s.initiator, metricName: 'read_kbps',      value: s.readKbPerSec  },
      { sanId, timestamp: now, category: 'session', subject: s.initiator, metricName: 'write_kbps',     value: s.writeKbPerSec },
      { sanId, timestamp: now, category: 'session', subject: s.initiator, metricName: 'read_kb_total',  value: s.readKbTotal   },
      { sanId, timestamp: now, category: 'session', subject: s.initiator, metricName: 'write_kb_total', value: s.writeKbTotal  },
    )
  }

  const deviceSnaps  = await readDeviceSnapshots()
  const deviceThrpts = pushDeviceSnapshots(deviceSnaps, sanId)

  for (const d of deviceThrpts) {
    samples.push(
      { sanId, timestamp: now, category: 'device', subject: d.device, metricName: 'read_kbps',   value: d.readKbPerSec  },
      { sanId, timestamp: now, category: 'device', subject: d.device, metricName: 'write_kbps',  value: d.writeKbPerSec },
      { sanId, timestamp: now, category: 'device', subject: d.device, metricName: 'read_iops',   value: d.readOpsPerSec  },
      { sanId, timestamp: now, category: 'device', subject: d.device, metricName: 'write_iops',  value: d.writeOpsPerSec },
    )
  }

  const hw = await readHardwareOverview()

  samples.push(
    { sanId, timestamp: now, category: 'system', subject: 'cpu', metricName: 'cpu_pct', value: hw.system.cpuUsagePct },
    { sanId, timestamp: now, category: 'system', subject: 'cpu', metricName: 'load_1m', value: hw.system.loadAvg[0]  },
    { sanId, timestamp: now, category: 'system', subject: 'cpu', metricName: 'load_5m', value: hw.system.loadAvg[1]  },
    { sanId, timestamp: now, category: 'memory', subject: 'ram', metricName: 'used_pct', value: hw.memory.usedPct    },
    { sanId, timestamp: now, category: 'memory', subject: 'ram', metricName: 'used_kb',  value: hw.memory.usedKb     },
  )

  for (const vol of hw.volumes) {
    const subj = vol.mountpoint.replace(/\//g, '_').replace(/^_/, '')
    samples.push(
      { sanId, timestamp: now, category: 'volume', subject: subj, metricName: 'used_pct', value: vol.usedPct },
      { sanId, timestamp: now, category: 'volume', subject: subj, metricName: 'used_kb',  value: vol.usedKb  },
    )
  }

  return samples
}

// ─── Collecte unitaire ────────────────────────────────────────────────────────

async function collectOnce(): Promise<void> {
  if (!hasConfiguredSSH()) return

  try {
    const activeSans = getActiveSans()

    if (activeSans.length >= 1) {
      const pool = getSSHPool()
      for (const san of activeSans) {
        const mgr = pool.get(san.id)
        if (!mgr?.isReady()) continue
        try {
          await withSanContext(san.id, async () => {
            const samples = await gatherSamplesForSan(san.id)
            if (samples.length > 0) await insertSamples(samples)
          })
        } catch (err) {
          console.warn('[Collector]', san.id, (err as Error).message)
        }
      }
      return
    }

    // v1 : aucune ligne SAN active en BDD — singleton SSH + SAN_ID pour métriques
    const manager = getActiveSSHManager()
    if (!manager.isReady()) return

    const samples = await gatherSamplesForSan(SAN_ID)
    if (samples.length > 0) await insertSamples(samples)
  } catch (err) {
    const message = (err as Error).message
    if (/not initialised/i.test(message)) return
    console.warn('[Collector] Erreur collecte:', message)
  }
}

// ─── Démarrage du collecteur ──────────────────────────────────────────────────

function startCollecting(intervalMs: number, retentionMs: number): void {
  currentRetentionMs = retentionMs
  collectTimer = setInterval(collectOnce, intervalMs)
}

// ─── Rechargement dynamique (appelé par PATCH /api/admin/settings) ────────────

export async function reloadCollector(): Promise<void> {
  if (collectTimer) {
    clearInterval(collectTimer)
    collectTimer = null
  }
  const config = await getCollectorConfig()
  if (!config.enabled) {
    console.info('[Collector] Désactivé par configuration.')
    return
  }
  console.info(`[Collector] Rechargement — intervalle=${config.intervalMs}ms, rétention=${config.retentionMs}ms`)
  startCollecting(config.intervalMs, config.retentionMs)
}

// ─── Plugin Nitro ─────────────────────────────────────────────────────────────

export default defineNitroPlugin(async (nitroApp) => {
  // Démarrage initial avec config depuis BDD (ou défauts)
  try {
    await reloadCollector()
  } catch (err) {
    console.warn('[Collector] Erreur démarrage:', (err as Error).message)
    // Fallback sur les constantes si la BDD n'est pas encore dispo
    startCollecting(30_000, 24 * 3_600_000)
  }

  // Purge horaire
  purgeTimer = setInterval(async () => {
    try {
      const deleted = await purgeOldSamples(currentRetentionMs)
      if (deleted > 0) console.info(`[Collector] Purge : ${deleted} samples supprimés`)
    } catch (err) {
      console.warn('[Collector] Erreur purge:', (err as Error).message)
    }
  }, 3_600_000)

  nitroApp.hooks.hook('close', () => {
    if (collectTimer) clearInterval(collectTimer)
    if (purgeTimer)   clearInterval(purgeTimer)
  })
})
