/**
 * Seuils d'alerte passives (volumes, sessions, FC) — clés `alerts.*` dans app_settings.
 */
import { createError } from 'h3'

export type SessionAlertPolicy = 'strict' | 'multipath'

export interface AlertSettings {
  volumeWarnPct: number
  volumeCriticalPct: number
  sessionEnabled: boolean
  sessionPolicy: SessionAlertPolicy
  sessionGraceSec: number
  sessionMinActive: number
  fcPortEnabled: boolean
}

export const ALERT_SETTINGS_KEYS = [
  'alerts.volume_warn_pct',
  'alerts.volume_critical_pct',
  'alerts.session_enabled',
  'alerts.session_policy',
  'alerts.session_grace_sec',
  'alerts.session_min_active',
  'alerts.fc_port_enabled',
] as const

export type AlertSettingsKey = (typeof ALERT_SETTINGS_KEYS)[number]

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  volumeWarnPct:       75,
  volumeCriticalPct:   90,
  sessionEnabled:      true,
  sessionPolicy:       'strict',
  sessionGraceSec:     120,
  sessionMinActive:    1,
  fcPortEnabled:       true,
}

function parseBool(s: string | undefined, fallback: boolean): boolean {
  if (s == null || s === '') return fallback
  return s === 'true' || s === '1'
}

function parseIntSafe(s: string | undefined, fallback: number): number {
  if (s == null || s === '') return fallback
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : fallback
}

function parsePolicy(s: string | undefined): SessionAlertPolicy {
  const v = (s ?? '').trim().toLowerCase()
  return v === 'multipath' ? 'multipath' : 'strict'
}

/** Construit la config à partir des lignes app_settings (valeurs manquantes → défauts). */
export function parseAlertSettingsFromMap(map: Record<string, string>): AlertSettings {
  return {
    volumeWarnPct:     parseIntSafe(map['alerts.volume_warn_pct'], DEFAULT_ALERT_SETTINGS.volumeWarnPct),
    volumeCriticalPct: parseIntSafe(map['alerts.volume_critical_pct'], DEFAULT_ALERT_SETTINGS.volumeCriticalPct),
    sessionEnabled:    parseBool(map['alerts.session_enabled'], DEFAULT_ALERT_SETTINGS.sessionEnabled),
    sessionPolicy:     parsePolicy(map['alerts.session_policy']),
    sessionGraceSec:   parseIntSafe(map['alerts.session_grace_sec'], DEFAULT_ALERT_SETTINGS.sessionGraceSec),
    sessionMinActive:  parseIntSafe(map['alerts.session_min_active'], DEFAULT_ALERT_SETTINGS.sessionMinActive),
    fcPortEnabled:     parseBool(map['alerts.fc_port_enabled'], DEFAULT_ALERT_SETTINGS.fcPortEnabled),
  }
}

/** Valide le corps PATCH pour les clés `alerts.*` (lève createError HTTP 400 si invalide). */
export function assertValidAlertSettingsPatch(body: Record<string, string>): void {
  const warn = body['alerts.volume_warn_pct']
  if (warn !== undefined && warn !== '') {
    const v = parseInt(warn, 10)
    if (Number.isNaN(v) || v < 1 || v > 99) {
      throw createError({ statusCode: 400, message: 'alerts.volume_warn_pct doit être entre 1 et 99' })
    }
  }

  const crit = body['alerts.volume_critical_pct']
  if (crit !== undefined && crit !== '') {
    const v = parseInt(crit, 10)
    if (Number.isNaN(v) || v < 1 || v > 100) {
      throw createError({ statusCode: 400, message: 'alerts.volume_critical_pct doit être entre 1 et 100' })
    }
  }

  if (
    warn !== undefined && warn !== '' &&
    crit !== undefined && crit !== ''
  ) {
    const w = parseInt(warn, 10)
    const c = parseInt(crit, 10)
    if (!Number.isNaN(w) && !Number.isNaN(c) && w >= c) {
      throw createError({
        statusCode: 400,
        message:    'alerts.volume_warn_pct doit être strictement inférieur à alerts.volume_critical_pct',
      })
    }
  }

  const grace = body['alerts.session_grace_sec']
  if (grace !== undefined && grace !== '') {
    const v = parseInt(grace, 10)
    if (Number.isNaN(v) || v < 0 || v > 3600) {
      throw createError({ statusCode: 400, message: 'alerts.session_grace_sec doit être entre 0 et 3600' })
    }
  }

  const minA = body['alerts.session_min_active']
  if (minA !== undefined && minA !== '') {
    const v = parseInt(minA, 10)
    if (Number.isNaN(v) || v < 1 || v > 4096) {
      throw createError({ statusCode: 400, message: 'alerts.session_min_active doit être entre 1 et 4096' })
    }
  }

  const pol = body['alerts.session_policy']
  if (pol !== undefined && pol !== '') {
    const p = pol.trim().toLowerCase()
    if (p !== 'strict' && p !== 'multipath') {
      throw createError({ statusCode: 400, message: 'alerts.session_policy doit être strict ou multipath' })
    }
  }
}
