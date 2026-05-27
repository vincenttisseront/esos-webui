import { describe, expect, it } from 'vitest'
import {
  getCollectorRunStatus,
  recordCollectorSuccess,
  setCollectorStatusConfig,
} from '~/server/utils/collector-status'

describe('collector-status', () => {
  it('records last successful run', () => {
    setCollectorStatusConfig({ enabled: true, intervalSec: 30, retentionHours: 24 })
    recordCollectorSuccess(42)
    const s = getCollectorRunStatus()
    expect(s.lastRunAt).toBeTruthy()
    expect(s.lastSamplesWritten).toBe(42)
    expect(s.lastError).toBeNull()
  })
})
