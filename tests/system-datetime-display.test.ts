import { describe, it, expect } from 'vitest'
import {
  parseSystemTimeUtc,
  resolveDisplayTimezone,
  formatSystemDateTimeDisplay,
} from '../utils/system-datetime-display'

describe('system-datetime-display', () => {
  it('parses Z suffix as UTC', () => {
    const d = parseSystemTimeUtc('2026-05-21T12:40:05Z')
    expect(d?.toISOString()).toBe('2026-05-21T12:40:05.000Z')
  })

  it('converts UTC instant to Europe/Paris local display', () => {
    const out = formatSystemDateTimeDisplay({
      currentTimeUtc: '2026-05-21T12:40:05Z',
      timezone:       'Europe/Paris',
      locale:         'fr',
    })
    expect(out.localMain).toContain('21/05/2026 14:40:05')
    expect(out.localMain).toContain('Europe/Paris')
    expect(out.utcSecondary).toBe('2026-05-21 12:40:05 UTC')
    expect(out.timezoneUnknown).toBe(false)
  })

  it('falls back to UTC for unknown timezone', () => {
    const out = formatSystemDateTimeDisplay({
      currentTimeUtc: '2026-05-21T12:40:05Z',
      timezone:       'Not/A_Zone',
      locale:         'en',
      utcFallbackLabel: 'unknown TZ',
    })
    expect(out.timezoneUnknown).toBe(true)
    expect(out.effectiveTimezone).toBe('UTC')
    expect(out.localMain).toContain('unknown TZ')
  })

  it('resolveDisplayTimezone accepts IANA ids', () => {
    expect(resolveDisplayTimezone('Europe/Paris').unknown).toBe(false)
    expect(resolveDisplayTimezone('').unknown).toBe(true)
  })
})
