import { describe, it, expect } from 'vitest'
import {
  previewVolumeStatuses,
  previewSessionViolations,
  previewFcPorts,
} from '../utils/alert-thresholds-preview'
import { DEFAULT_ALERT_SETTINGS } from '../server/utils/alert-settings'
import { createEmptyOverview } from '../types/esos'
import type { Overview } from '../types/esos'

describe('alert-thresholds-preview', () => {
  it('classifies volume usage tiers', () => {
    const rows = previewVolumeStatuses(
      [
        { mountpoint: '/a', totalKb: 100, usedKb: 50, availableKb: 50, usedPct: 50 },
        { mountpoint: '/b', totalKb: 100, usedKb: 80, availableKb: 20, usedPct: 80 },
        { mountpoint: '/c', totalKb: 100, usedKb: 95, availableKb: 5, usedPct: 95 },
      ],
      { volumeWarnPct: 75, volumeCriticalPct: 90 },
    )
    expect(rows[0]!.status).toBe('ok')
    expect(rows[1]!.status).toBe('warning')
    expect(rows[2]!.status).toBe('critical')
  })

  it('strict mode lists missing initiators', () => {
    const overview: Overview = {
      ...createEmptyOverview(),
      targets: [
        {
          name:     't1',
          driver:   'iscsi',
          enabled:  true,
          hwTarget: false,
          attrs:    {},
          groups:   [{ name: 'g1', initiators: ['ini-a', 'ini-b'], luns: [] }],
          luns:     [],
          sessions: [],
        },
      ],
      sessions: [],
    }
    const rows = previewSessionViolations(overview, {
      ...DEFAULT_ALERT_SETTINGS,
      sessionEnabled: true,
      sessionPolicy:  'strict',
    })
    expect(rows.length).toBe(2)
    expect(rows.every((r) => r.timing === 'after_grace')).toBe(true)
  })

  it('multipath mode flags low active count', () => {
    const overview: Overview = {
      ...createEmptyOverview(),
      targets: [
        {
          name:     't1',
          driver:   'iscsi',
          enabled:  true,
          hwTarget: false,
          attrs:    {},
          groups:   [{ name: 'g1', initiators: ['ini-a', 'ini-b'], luns: [] }],
          luns:     [],
          sessions: [],
        },
      ],
      sessions: [{ target: 't1', initiatorName: 'ini-a', driver: 'iscsi', ipAddr: '', sid: '1' }],
    }
    const rows = previewSessionViolations(overview, {
      ...DEFAULT_ALERT_SETTINGS,
      sessionEnabled:   true,
      sessionPolicy:    'multipath',
      sessionMinActive: 2,
      sessionGraceSec:  0,
    })
    expect(rows.length).toBe(1)
    expect(rows[0]!.timing).toBe('immediate')
  })

  it('FC preview respects enabled toggle', () => {
    const ports = [
      {
        host: 'h1', portName: 'p0', portState: 'Offline' as const,
        symbolicName: '', supportedSpeeds: '',
      },
    ]
    expect(previewFcPorts(ports, false)[0]!.wouldAlert).toBe(false)
    expect(previewFcPorts(ports, true)[0]!.wouldAlert).toBe(true)
  })
})
