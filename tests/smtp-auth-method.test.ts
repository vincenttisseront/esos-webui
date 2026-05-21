import { describe, it, expect } from 'vitest'
import {
  SMTP_AUTH_METHOD_NONE,
  toUiSmtpAuthMethod,
  toBackendSmtpAuthMethod,
  smtpAuthMethodSelectItems,
} from '../utils/smtp-auth-method'

describe('smtp-auth-method', () => {
  it('maps empty backend to none for UI', () => {
    expect(toUiSmtpAuthMethod('')).toBe(SMTP_AUTH_METHOD_NONE)
    expect(toUiSmtpAuthMethod(undefined)).toBe(SMTP_AUTH_METHOD_NONE)
  })

  it('maps known methods both ways', () => {
    expect(toUiSmtpAuthMethod('LOGIN')).toBe('LOGIN')
    expect(toBackendSmtpAuthMethod('LOGIN')).toBe('LOGIN')
  })

  it('maps none to empty for backend', () => {
    expect(toBackendSmtpAuthMethod(SMTP_AUTH_METHOD_NONE)).toBe('')
    expect(toBackendSmtpAuthMethod('none')).toBe('')
  })

  it('select items never use empty string value', () => {
    const items = smtpAuthMethodSelectItems({
      none: 'Aucune',
      login: 'LOGIN',
      plain: 'PLAIN',
      cram: 'CRAM-MD5',
    })
    for (const item of items) {
      expect(item.value).not.toBe('')
    }
    expect(items[0].value).toBe('none')
  })
})
