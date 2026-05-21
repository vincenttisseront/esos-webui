import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { globalSshBannerTone, shouldShowGlobalSshBanner } from '~/utils/error-banner'
import { useErrorStore } from '~/stores/error'
import { useOverviewStore } from '~/stores/overview'

describe('error-banner utils', () => {
  it('hides global banner when SSH connected and no SSH-source errors', () => {
    expect(shouldShowGlobalSshBanner('connected', false)).toBe(false)
  })

  it('shows global banner when SSH is error', () => {
    expect(shouldShowGlobalSshBanner('error', false)).toBe(true)
    expect(globalSshBannerTone('error')).toBe('error')
  })

  it('shows global banner when connecting', () => {
    expect(shouldShowGlobalSshBanner('connecting', false)).toBe(true)
  })
})

describe('overview store error handling', () => {
  it('clearSource overview is available after successful fetch path', () => {
    setActivePinia(createPinia())
    const errorStore = useErrorStore()
    errorStore.push({
      level: 'warning',
      message: 'failed',
      source: 'overview',
      kind: 'refresh_failed',
      endpoint: '/api/overview',
    })
    expect(errorStore.activeCount).toBe(1)
    errorStore.clearSource('overview')
    expect(errorStore.activeCount).toBe(0)
    expect(shouldShowGlobalSshBanner('connected', false)).toBe(false)
  })
})

describe('overview store', () => {
  it('tracks stale data when error set after prior success', () => {
    setActivePinia(createPinia())
    const store = useOverviewStore()
    store.data = { targets: [], devices: [], sessions: [], stats: undefined } as any
    store.lastRefresh = new Date(Date.now() - 120_000)
    store.error = 'refresh failed'
    expect(store.hasData).toBe(true)
    expect(store.isStale).toBe(true)
  })
})
