/**
 * Client-safe alert threshold validation (mirrors server/utils/alert-settings.ts).
 */
import type { SessionAlertPolicy } from '../server/utils/alert-settings'

export type AlertThresholdForm = {
  volumeWarnPct:     number
  volumeCriticalPct: number
  sessionEnabled:    boolean
  sessionPolicy:     SessionAlertPolicy
  sessionGraceSec:   number
  sessionMinActive:  number
  fcPortEnabled:     boolean
}

export type AlertThresholdValidationId =
  | 'volume_warn_range'
  | 'volume_critical_range'
  | 'volume_warn_lt_critical'
  | 'session_grace_range'
  | 'session_min_active_range'

export type SessionModeUi = 'disabled' | 'strict' | 'normal'

export function formToSessionMode(form: AlertThresholdForm): SessionModeUi {
  if (!form.sessionEnabled) return 'disabled'
  return form.sessionPolicy === 'multipath' ? 'normal' : 'strict'
}

export function applySessionModeToForm(
  mode: SessionModeUi,
  form: AlertThresholdForm,
): void {
  if (mode === 'disabled') {
    form.sessionEnabled = false
    return
  }
  form.sessionEnabled = true
  form.sessionPolicy = mode === 'normal' ? 'multipath' : 'strict'
}

export function validateAlertThresholdForm(form: AlertThresholdForm): AlertThresholdValidationId[] {
  const ids: AlertThresholdValidationId[] = []

  const warn = form.volumeWarnPct
  if (!Number.isFinite(warn) || warn < 0 || warn > 100 || !Number.isInteger(warn)) {
    ids.push('volume_warn_range')
  }

  const crit = form.volumeCriticalPct
  if (!Number.isFinite(crit) || crit < 0 || crit > 100 || !Number.isInteger(crit)) {
    ids.push('volume_critical_range')
  }

  if (
    ids.length === 0
    && Number.isFinite(warn)
    && Number.isFinite(crit)
    && warn >= crit
  ) {
    ids.push('volume_warn_lt_critical')
  }

  const grace = form.sessionGraceSec
  if (!Number.isFinite(grace) || grace < 0 || grace > 3600 || !Number.isInteger(grace)) {
    ids.push('session_grace_range')
  }

  const minA = form.sessionMinActive
  if (!Number.isFinite(minA) || minA < 0 || minA > 4096 || !Number.isInteger(minA)) {
    ids.push('session_min_active_range')
  }

  return ids
}

export function alertThresholdFormValid(form: AlertThresholdForm): boolean {
  return validateAlertThresholdForm(form).length === 0
}
