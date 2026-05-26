import { describe, it, expect } from 'vitest'
import {
  validateAlertThresholdForm,
  alertThresholdFormValid,
  formToSessionMode,
  applySessionModeToForm,
  type AlertThresholdForm,
} from '../utils/alert-thresholds-validation'
import { DEFAULT_ALERT_SETTINGS } from '../server/utils/alert-settings'

function baseForm(overrides: Partial<AlertThresholdForm> = {}): AlertThresholdForm {
  return { ...DEFAULT_ALERT_SETTINGS, ...overrides }
}

describe('alert-thresholds-validation', () => {
  it('accepts default settings', () => {
    expect(alertThresholdFormValid(baseForm())).toBe(true)
  })

  it('rejects warn >= critical', () => {
    const ids = validateAlertThresholdForm(baseForm({ volumeWarnPct: 90, volumeCriticalPct: 80 }))
    expect(ids).toContain('volume_warn_lt_critical')
  })

  it('rejects volume out of 0-100', () => {
    expect(validateAlertThresholdForm(baseForm({ volumeWarnPct: 101 }))).toContain('volume_warn_range')
    expect(validateAlertThresholdForm(baseForm({ volumeCriticalPct: -1 }))).toContain('volume_critical_range')
  })

  it('allows session_min_active 0', () => {
    expect(validateAlertThresholdForm(baseForm({ sessionMinActive: 0 }))).toEqual([])
  })

  it('maps session UI modes to form fields', () => {
    const form = baseForm()
    applySessionModeToForm('disabled', form)
    expect(form.sessionEnabled).toBe(false)
    expect(formToSessionMode(form)).toBe('disabled')

    applySessionModeToForm('normal', form)
    expect(form.sessionEnabled).toBe(true)
    expect(form.sessionPolicy).toBe('multipath')
    expect(formToSessionMode(form)).toBe('normal')

    applySessionModeToForm('strict', form)
    expect(form.sessionPolicy).toBe('strict')
    expect(formToSessionMode(form)).toBe('strict')
  })
})
