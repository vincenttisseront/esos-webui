import { describe, it, expect } from 'vitest'
import {
  authProvidersReadOnly,
  canEditAuthProviders,
  canViewAuthProviders,
} from '../utils/auth-providers-permissions'

describe('auth-providers-permissions', () => {
  it('admin can edit', () => {
    expect(canEditAuthProviders('admin')).toBe(true)
    expect(authProvidersReadOnly('admin')).toBe(false)
  })

  it('operator and viewer are read-only (RBAC, not SAN state)', () => {
    expect(canEditAuthProviders('operator')).toBe(false)
    expect(canEditAuthProviders('viewer')).toBe(false)
    expect(authProvidersReadOnly('operator')).toBe(true)
    expect(authProvidersReadOnly('viewer')).toBe(true)
  })

  it('view access matches API read roles', () => {
    expect(canViewAuthProviders('admin')).toBe(true)
    expect(canViewAuthProviders('operator')).toBe(true)
    expect(canViewAuthProviders('viewer')).toBe(true)
  })

  it('unknown role cannot view or edit', () => {
    expect(canViewAuthProviders(undefined)).toBe(false)
    expect(canEditAuthProviders(undefined)).toBe(false)
    expect(authProvidersReadOnly(null)).toBe(true)
  })
})
