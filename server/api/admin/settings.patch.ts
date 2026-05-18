import { createError, defineEventHandler, readBody } from 'h3'
import { getAllSettings, setSettings } from '../../db/repositories/settings.repository'
import { invalidateCache } from '../../utils/cache'
import { reloadCollector } from '../../plugins/collector'
import { assertValidAlertSettingsPatch, ALERT_SETTINGS_KEYS } from '../../utils/alert-settings'

const COLLECTOR_KEYS = new Set([
  'collector.enabled',
  'collector.interval_sec',
  'collector.retention_hours',
])

const ALERT_KEYS = new Set<string>(ALERT_SETTINGS_KEYS as unknown as string[])

const ALLOWED_KEYS = new Set([...COLLECTOR_KEYS, ...ALERT_KEYS])

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, string>>(event)

  const entries = Object.entries(body).filter(([key]) => ALLOWED_KEYS.has(key))
  if (entries.length === 0) {
    throw createError({ statusCode: 400, message: 'Aucune clé valide fournie' })
  }

  assertValidAlertSettingsPatch(body)

  if (body['alerts.volume_warn_pct'] !== undefined || body['alerts.volume_critical_pct'] !== undefined) {
    const current = await getAllSettings()
    const w = parseInt(
      body['alerts.volume_warn_pct'] ?? current['alerts.volume_warn_pct'] ?? '75',
      10,
    )
    const c = parseInt(
      body['alerts.volume_critical_pct'] ?? current['alerts.volume_critical_pct'] ?? '90',
      10,
    )
    if (!Number.isNaN(w) && !Number.isNaN(c) && w >= c) {
      throw createError({
        statusCode: 400,
        message:    'alerts.volume_warn_pct doit être strictement inférieur à alerts.volume_critical_pct',
      })
    }
  }

  if (body['collector.interval_sec']) {
    const v = parseInt(body['collector.interval_sec'], 10)
    if (isNaN(v) || v < 10 || v > 300) {
      throw createError({
        statusCode: 400,
        message: 'collector.interval_sec doit être entre 10 et 300 secondes',
      })
    }
  }

  if (body['collector.retention_hours']) {
    const v = parseInt(body['collector.retention_hours'], 10)
    if (isNaN(v) || v < 1 || v > 168) {
      throw createError({
        statusCode: 400,
        message: 'collector.retention_hours doit être entre 1 et 168 heures (7 jours)',
      })
    }
  }

  await setSettings(entries.map(([key, value]) => ({ key, value })))
  invalidateCache()

  const updatedKeys = entries.map(([k]) => k)
  if (updatedKeys.some((k) => k.startsWith('collector.'))) {
    await reloadCollector()
  }

  return { ok: true, updated: updatedKeys }
})
