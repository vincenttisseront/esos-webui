/** Client-safe LDAP event shape and copy formatter (no DB imports). */

export type LdapAuthEventRecord = {
  id:                string
  at:                string
  eventType:         'test' | 'login' | 'provisioning'
  action:            string
  step:              string
  result:            'success' | 'failure' | 'skipped'
  safeCode:          string | null
  username:          string | null
  provider:          string
  urlHost:           string | null
  baseDn:            string | null
  renderedFilter:    string | null
  ldapErrorName:     string | null
  ldapErrorCode:     string | null
  diagnosticMessage: string | null
  matchedDn:         string | null
  referralsJson:     string | null
  durationMs:        number | null
  requestIp:         string | null
  userAgent:         string | null
  stepResultsJson:   string | null
}

export function formatLdapAuthEventForCopy(e: LdapAuthEventRecord): string {
  const lines = [
    `time: ${e.at}`,
    `type: ${e.eventType} / ${e.action}`,
    `step: ${e.step}`,
    `result: ${e.result}`,
    `safeCode: ${e.safeCode ?? '—'}`,
    `username: ${e.username ?? '—'}`,
    `host: ${e.urlHost ?? '—'}`,
    `baseDn: ${e.baseDn ?? '—'}`,
  ]
  if (e.renderedFilter) lines.push(`filter: ${e.renderedFilter}`)
  if (e.ldapErrorName) lines.push(`ldapError: ${e.ldapErrorName} (${e.ldapErrorCode ?? '?'})`)
  if (e.diagnosticMessage) lines.push(`message: ${e.diagnosticMessage}`)
  if (e.matchedDn) lines.push(`matchedDN: ${e.matchedDn}`)
  if (e.referralsJson) lines.push(`referrals: ${e.referralsJson}`)
  if (e.durationMs != null) lines.push(`durationMs: ${e.durationMs}`)
  if (e.requestIp) lines.push(`ip: ${e.requestIp}`)
  return lines.join('\n')
}
