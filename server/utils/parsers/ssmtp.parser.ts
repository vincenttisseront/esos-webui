import type { SMTPConfig } from '../types'

export function parseSsmtpConf(content: string): Omit<SMTPConfig, 'authPass'> {
  const kv = new Map<string, string>()
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z]+)\s*=\s*(.+)/)
    if (m) kv.set(m[1].trim(), m[2].trim())
  }

  return {
    alertEmail:   kv.get('root')             ?? '',
    mailHub:      kv.get('mailhub')          ?? '',
    authUser:     kv.get('AuthUser')         ?? '',
    useTLS:       kv.get('UseTLS')           === 'YES',
    useSTARTTLS:  kv.get('UseSTARTTLS')      === 'YES',
    authMethod:   (kv.get('AuthMethod')      ?? '') as SMTPConfig['authMethod'],
    fromOverride: kv.get('FromLineOverride') === 'YES',
  }
}

export function serializeSsmtpConf(config: SMTPConfig): string {
  const lines: string[] = [
    `root=${config.alertEmail}`,
    `mailhub=${config.mailHub}`,
    `FromLineOverride=${config.fromOverride ? 'YES' : 'NO'}`,
  ]

  if (config.authUser)    lines.push(`AuthUser=${config.authUser}`)
  if (config.authPass)    lines.push(`AuthPass=${config.authPass}`)
  if (config.authMethod)  lines.push(`AuthMethod=${config.authMethod}`)
  if (config.useTLS)      lines.push('UseTLS=YES')
  if (config.useSTARTTLS) lines.push('UseSTARTTLS=YES')

  return lines.join('\n') + '\n'
}
