/**
 * SMTP AuthMethod mapping: UI select uses "none" (Radix reserves "" for clear).
 * Backend / ssmtp.conf omit AuthMethod or use empty when none.
 */

export const SMTP_AUTH_METHOD_NONE = 'none' as const

export type SmtpAuthMethodUi = typeof SMTP_AUTH_METHOD_NONE | 'LOGIN' | 'PLAIN' | 'CRAM-MD5'

export type SmtpAuthMethodBackend = '' | 'LOGIN' | 'PLAIN' | 'CRAM-MD5'

export function toUiSmtpAuthMethod(method: SmtpAuthMethodBackend | null | undefined): SmtpAuthMethodUi {
  const m = (method ?? '').trim()
  if (m === 'LOGIN' || m === 'PLAIN' || m === 'CRAM-MD5') return m
  return SMTP_AUTH_METHOD_NONE
}

export function toBackendSmtpAuthMethod(method: SmtpAuthMethodUi | string | null | undefined): SmtpAuthMethodBackend {
  const m = (method ?? '').trim()
  if (m === SMTP_AUTH_METHOD_NONE || m === '') return ''
  if (m === 'LOGIN' || m === 'PLAIN' || m === 'CRAM-MD5') return m
  return ''
}

export function smtpAuthMethodSelectItems(labels: {
  none: string
  login: string
  plain: string
  cram: string
}): Array<{ label: string; value: SmtpAuthMethodUi }> {
  return [
    { label: labels.none,  value: SMTP_AUTH_METHOD_NONE },
    { label: labels.login, value: 'LOGIN' },
    { label: labels.plain, value: 'PLAIN' },
    { label: labels.cram,  value: 'CRAM-MD5' },
  ]
}
