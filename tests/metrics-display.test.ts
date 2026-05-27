import { describe, expect, it } from 'vitest'
import {
  historyEmptyReasonKey,
  kbpsToBytesPerSec,
  kbpsTooltipLabel,
} from '~/utils/metrics-display'

describe('metrics-display', () => {
  it('maps empty reason to i18n key', () => {
    expect(historyEmptyReasonKey('range_empty')).toBe('monitoring.history.empty.range_empty')
    expect(historyEmptyReasonKey(null)).toBe('')
  })

  it('converts KB/s to bytes/s', () => {
    expect(kbpsToBytesPerSec(1)).toBe(1024)
  })

  it('formats kbps tooltip', () => {
    expect(kbpsTooltipLabel(2048, 'dev')).toContain('MB/s')
  })
})
