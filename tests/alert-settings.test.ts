import { describe, it, expect } from 'vitest'
import {
  parseAlertSettingsFromMap,
  assertValidAlertSettingsPatch,
  DEFAULT_ALERT_SETTINGS,
} from '../server/utils/alert-settings'

describe('parseAlertSettingsFromMap', () => {
  it('applique les défauts pour une map vide', () => {
    expect(parseAlertSettingsFromMap({})).toEqual(DEFAULT_ALERT_SETTINGS)
  })

  it('parse les booléens et entiers', () => {
    const s = parseAlertSettingsFromMap({
      'alerts.session_enabled':    'false',
      'alerts.fc_port_enabled':    '0',
      'alerts.session_grace_sec':  '60',
      'alerts.session_policy':     'multipath',
      'alerts.volume_warn_pct':    '70',
      'alerts.volume_critical_pct': '85',
      'alerts.session_min_active': '2',
    })
    expect(s.sessionEnabled).toBe(false)
    expect(s.fcPortEnabled).toBe(false)
    expect(s.sessionGraceSec).toBe(60)
    expect(s.sessionPolicy).toBe('multipath')
    expect(s.volumeWarnPct).toBe(70)
    expect(s.volumeCriticalPct).toBe(85)
    expect(s.sessionMinActive).toBe(2)
  })
})

describe('assertValidAlertSettingsPatch', () => {
  it('accepte un patch volume cohérent', () => {
    expect(() =>
      assertValidAlertSettingsPatch({
        'alerts.volume_warn_pct':     '70',
        'alerts.volume_critical_pct': '90',
      }),
    ).not.toThrow()
  })

  it('rejette warn >= critical', () => {
    expect(() =>
      assertValidAlertSettingsPatch({
        'alerts.volume_warn_pct':     '90',
        'alerts.volume_critical_pct': '80',
      }),
    ).toThrow()
  })

  it('rejette une politique inconnue', () => {
    expect(() =>
      assertValidAlertSettingsPatch({ 'alerts.session_policy': 'rr' }),
    ).toThrow()
  })
})
