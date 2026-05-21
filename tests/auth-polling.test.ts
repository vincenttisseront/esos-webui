import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  isUnauthorizedError,
  isPublicApiPath,
  shouldHandleUnauthorized,
  normalizeApiPath,
} from '../utils/auth-api'
import { useSSHStore } from '../stores/ssh'
import { useOverviewStore } from '../stores/overview'
import { useStatsStore } from '../stores/stats'

describe('auth-api', () => {
  it('detects 401 fetch errors', () => {
    expect(isUnauthorizedError({ statusCode: 401 })).toBe(true)
    expect(isUnauthorizedError({ response: { status: 401 } })).toBe(true)
    expect(isUnauthorizedError({ statusCode: 403 })).toBe(false)
  })

  it('treats login and providers as public', () => {
    expect(isPublicApiPath('/api/auth/login')).toBe(true)
    expect(isPublicApiPath('/api/auth/providers')).toBe(true)
    expect(isPublicApiPath('/api/ssh-status')).toBe(false)
  })

  it('handles 401 for protected API paths only', () => {
    expect(shouldHandleUnauthorized('/api/overview')).toBe(true)
    expect(shouldHandleUnauthorized('/api/auth/login')).toBe(false)
    expect(shouldHandleUnauthorized('/api/auth/me')).toBe(true)
  })

  it('normalizes full URLs to pathname', () => {
    expect(normalizeApiPath('https://host/api/overview?q=1')).toBe('/api/overview')
  })
})

describe('store stopPolling', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('ssh stopPolling clears interval handle', () => {
    const ssh = useSSHStore()
    ssh.pollInterval = setInterval(() => {}, 60_000)
    ssh.stopPolling()
    expect(ssh.pollInterval).toBeNull()
  })

  it('overview stopPolling clears interval handle', () => {
    const overview = useOverviewStore()
    overview.pollInterval = setInterval(() => {}, 60_000)
    overview.stopPolling()
    expect(overview.pollInterval).toBeNull()
  })

  it('stats stopPolling clears interval handle', () => {
    const stats = useStatsStore()
    stats.pollInterval = setInterval(() => {}, 60_000)
    stats.stopPolling()
    expect(stats.pollInterval).toBeNull()
  })
})
