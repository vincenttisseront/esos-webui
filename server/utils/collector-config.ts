import { getSetting } from '../db/repositories/settings.repository'

export interface CollectorConfig {
  enabled: boolean
  intervalMs: number
  retentionMs: number
  intervalSec: number
  retentionHours: number
}

export async function getCollectorConfig(): Promise<CollectorConfig> {
  const [enabled, intervalSec, retentionHours] = await Promise.all([
    getSetting('collector.enabled'),
    getSetting('collector.interval_sec'),
    getSetting('collector.retention_hours'),
  ])
  const sec = parseInt(intervalSec ?? '30', 10)
  const hours = parseInt(retentionHours ?? '24', 10)
  return {
    enabled: (enabled ?? 'true') === 'true',
    intervalMs: sec * 1000,
    retentionMs: hours * 3_600_000,
    intervalSec: sec,
    retentionHours: hours,
  }
}
