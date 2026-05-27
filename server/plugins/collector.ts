import { defineNitroPlugin } from 'nitropack/runtime'
import { readSessionSnapshots, readDeviceSnapshots } from '../utils/io-stats-reader'
import { pushSessionSnapshots, pushDeviceSnapshots } from '../utils/metrics-store'
import { readHardwareOverview } from '../utils/hardware-reader'
import { insertSamples, purgeOldSamples } from '../db/repositories/metrics.repository'
import { getCollectorConfig } from '../utils/collector-config'
import { recordCollectorError, recordCollectorSuccess, setCollectorStatusConfig } from '../utils/collector-status'
import { defaultMetricsSanId, METRICS_SESSION_DRIVERS } from '../utils/metrics-constants'
import { getSSHPool } from '../utils/ssh-pool'
import { hasConfiguredSSH, getActiveSSHManager, withSanContext } from '../utils/ssh-runtime'
import { getActiveSans } from '../utils/san-request-context'
import type { InsertSample } from '../db/repositories/metrics.repository'

let collectTimer: ReturnType<typeof setInterval> | null = null
let purgeTimer: ReturnType<typeof setInterval> | null = null
let currentRetentionMs = 24 * 3_600_000

async function gatherSamplesForSan(sanId: string): Promise<InsertSample[]> {
  const samples: InsertSample[] = []
  const now = Date.now()

  const sessionSnaps = await readSessionSnapshots([...METRICS_SESSION_DRIVERS])
  const sessionThrpts = pushSessionSnapshots(sessionSnaps, sanId)

  for (const s of sessionThrpts) {
    if (s.readKbPerSec > 0 || s.writeKbPerSec > 0) {
      samples.push(
        { sanId, timestamp: now, category: 'session', subject: s.initiator, metricName: 'read_kbps', value: s.readKbPerSec },
        { sanId, timestamp: now, category: 'session', subject: s.initiator, metricName: 'write_kbps', value: s.writeKbPerSec },
      )
    }
    samples.push(
      { sanId, timestamp: now, category: 'session', subject: s.initiator, metricName: 'read_kb_total', value: s.readKbTotal },
      { sanId, timestamp: now, category: 'session', subject: s.initiator, metricName: 'write_kb_total', value: s.writeKbTotal },
    )
  }

  const deviceSnaps = await readDeviceSnapshots()
  const deviceThrpts = pushDeviceSnapshots(deviceSnaps, sanId)

  for (const d of deviceThrpts) {
    if (d.readKbPerSec > 0 || d.writeKbPerSec > 0 || d.readOpsPerSec > 0 || d.writeOpsPerSec > 0) {
      samples.push(
        { sanId, timestamp: now, category: 'device', subject: d.device, metricName: 'read_kbps', value: d.readKbPerSec },
        { sanId, timestamp: now, category: 'device', subject: d.device, metricName: 'write_kbps', value: d.writeKbPerSec },
        { sanId, timestamp: now, category: 'device', subject: d.device, metricName: 'read_iops', value: d.readOpsPerSec },
        { sanId, timestamp: now, category: 'device', subject: d.device, metricName: 'write_iops', value: d.writeOpsPerSec },
      )
    }
  }

  const hw = await readHardwareOverview()

  samples.push(
    { sanId, timestamp: now, category: 'system', subject: 'cpu', metricName: 'cpu_pct', value: hw.system.cpuUsagePct },
    { sanId, timestamp: now, category: 'system', subject: 'cpu', metricName: 'load_1m', value: hw.system.loadAvg[0] },
    { sanId, timestamp: now, category: 'system', subject: 'cpu', metricName: 'load_5m', value: hw.system.loadAvg[1] },
    { sanId, timestamp: now, category: 'memory', subject: 'ram', metricName: 'used_pct', value: hw.memory.usedPct },
    { sanId, timestamp: now, category: 'memory', subject: 'ram', metricName: 'used_kb', value: hw.memory.usedKb },
  )

  for (const vol of hw.volumes) {
    const subj = vol.mountpoint.replace(/\//g, '_').replace(/^_/, '') || 'root'
    samples.push(
      { sanId, timestamp: now, category: 'volume', subject: subj, metricName: 'used_pct', value: vol.usedPct },
      { sanId, timestamp: now, category: 'volume', subject: subj, metricName: 'used_kb', value: vol.usedKb },
    )
  }

  return samples
}

async function collectOnce(): Promise<void> {
  if (!hasConfiguredSSH()) return

  try {
    const activeSans = getActiveSans()
    let totalWritten = 0

    if (activeSans.length >= 1) {
      const pool = getSSHPool()
      for (const san of activeSans) {
        const mgr = pool.get(san.id)
        if (!mgr?.isReady()) continue
        try {
          await withSanContext(san.id, async () => {
            const samples = await gatherSamplesForSan(san.id)
            if (samples.length > 0) {
              await insertSamples(samples)
              totalWritten += samples.length
            }
          })
        } catch (err) {
          const message = (err as Error).message
          console.warn('[Collector]', san.id, message)
          recordCollectorError(`${san.id}: ${message}`)
        }
      }
      recordCollectorSuccess(totalWritten)
      return
    }

    const manager = getActiveSSHManager()
    if (!manager.isReady()) return

    const sanId = defaultMetricsSanId()
    const samples = await gatherSamplesForSan(sanId)
    if (samples.length > 0) await insertSamples(samples)
    recordCollectorSuccess(samples.length)
  } catch (err) {
    const message = (err as Error).message
    if (/not initialised/i.test(message)) return
    console.warn('[Collector] Erreur collecte:', message)
    recordCollectorError(message)
  }
}

function startCollecting(intervalMs: number, retentionMs: number): void {
  currentRetentionMs = retentionMs
  collectTimer = setInterval(collectOnce, intervalMs)
}

export async function reloadCollector(): Promise<void> {
  if (collectTimer) {
    clearInterval(collectTimer)
    collectTimer = null
  }
  const config = await getCollectorConfig()
  setCollectorStatusConfig({
    enabled: config.enabled,
    intervalSec: config.intervalSec,
    retentionHours: config.retentionHours,
  })
  if (!config.enabled) {
    console.info('[Collector] Désactivé par configuration.')
    return
  }
  console.info(`[Collector] Rechargement — intervalle=${config.intervalMs}ms, rétention=${config.retentionMs}ms`)
  startCollecting(config.intervalMs, config.retentionMs)
}

export default defineNitroPlugin(async (nitroApp) => {
  try {
    await reloadCollector()
  } catch (err) {
    console.warn('[Collector] Erreur démarrage:', (err as Error).message)
    startCollecting(30_000, 24 * 3_600_000)
  }

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
    if (purgeTimer) clearInterval(purgeTimer)
  })
})
