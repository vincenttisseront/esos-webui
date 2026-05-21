import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  pauseAllPolling,
  resumeAllPolling,
  isPollingPaused,
  registerPoller,
  unregisterPoller,
} from '../utils/polling-coordinator'

describe('polling-coordinator', () => {
  beforeEach(() => {
    pauseAllPolling()
    resumeAllPolling()
  })

  it('pauseAll stops active pollers', () => {
    const start = vi.fn()
    const stop = vi.fn()
    registerPoller({ name: 'test-poller', start, stop })
    start.mockClear()
    stop.mockClear()

    pauseAllPolling()
    expect(isPollingPaused()).toBe(true)
    expect(stop).toHaveBeenCalled()
  })

  it('unregisterPoller stops and removes', () => {
    const stop = vi.fn()
    registerPoller({ name: 'rm-poller', start: vi.fn(), stop })
    unregisterPoller('rm-poller')
    expect(stop).toHaveBeenCalled()
  })
})
