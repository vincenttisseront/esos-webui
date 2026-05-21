import { describe, it, expect } from 'vitest'
import { shouldSkipAuthMeFetch, SESSION_COOKIE_NAME } from '../utils/auth-client'

describe('shouldSkipAuthMeFetch', () => {
  it('skips on login routes', () => {
    expect(shouldSkipAuthMeFetch('/login')).toBe(true)
    expect(shouldSkipAuthMeFetch('/login/')).toBe(true)
  })

  it('does not skip protected app routes', () => {
    expect(shouldSkipAuthMeFetch('/')).toBe(false)
    expect(shouldSkipAuthMeFetch('/admin/users')).toBe(false)
  })
})

describe('SESSION_COOKIE_NAME', () => {
  it('matches server session cookie', () => {
    expect(SESSION_COOKIE_NAME).toBe('esos_session')
  })
})
