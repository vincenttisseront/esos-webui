/**
 * Persist sanitized LDAP test / login / provisioning events for admin UI.
 * No passwords or bind secrets. Retention: 30 days + max 5000 rows.
 */
import type { AdminAuthProvidersDto } from './auth-providers-config'
import type { LdapTestDiagnostic, LdapStepProgress, LdapTestStep } from './ldap-diagnostics'
import {
  buildLdapFailureDiagnostic,
  buildLdapTestConfigSummary,
} from './ldap-diagnostics'
import { insertLdapAuthEvent } from '../db/repositories/ldap-auth-event.repository'
import {
  ldapLoginIdentityDiagnosticMessage,
  resolveLdapLoginIdentity,
} from './ldap-username-normalize'

export type LdapAuthEventType = 'test' | 'login' | 'provisioning'
export type LdapAuthEventResult = 'success' | 'failure' | 'skipped'

export type { LdapAuthEventRecord } from '../../utils/ldap-auth-events-format'
export { formatLdapAuthEventForCopy } from '../../utils/ldap-auth-events-format'
import type { LdapAuthEventRecord } from '../../utils/ldap-auth-events-format'

const SECRET_PATTERN = /password|passwd|bindpw|secret|credential/i

export function sanitizeLdapEventText(value: string | null | undefined, maxLen = 512): string | null {
  if (value == null) return null
  const t = value.trim()
  if (!t || SECRET_PATTERN.test(t)) return null
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t
}

export function sanitizeLdapUsername(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const t = value.trim()
  if (SECRET_PATTERN.test(t) || t.length > 128) return null
  return t
}

export function ldapUrlHostOnly(url: string | null | undefined): string | null {
  if (!url?.trim()) return null
  try {
    const normalized = url.includes('://') ? url : `ldap://${url}`
    return new URL(normalized).host || null
  } catch {
    return sanitizeLdapEventText(url, 120)
  }
}

function mapDiagnosticStep(step: string): string {
  if (step === 'starttls') return 'tls'
  return step
}

function resultFromDiagnostic(d: LdapTestDiagnostic, httpOk?: boolean): LdapAuthEventResult {
  const okCodes = new Set([
    'connect_ok',
    'bind_ok',
    'search_ok',
    'group_read_ok',
    'user_not_found',
  ])
  if (httpOk === false) return 'failure'
  if (okCodes.has(d.safeCode)) {
    if (d.safeCode === 'user_not_found') return 'failure'
    return 'success'
  }
  return 'failure'
}

function testActionFromLdapAction(action: string): string {
  switch (action) {
    case 'connect':    return 'connect'
    case 'bind':       return 'bind'
    case 'search':
    case 'searchRoot': return 'search'
    case 'group':      return 'groupRead'
    case 'full':       return 'full'
    default:           return action
  }
}

function stepResultsToJson(stepResults?: LdapStepProgress[]): string | null {
  if (!stepResults?.length) return null
  try {
    return JSON.stringify(
      stepResults.map((r) => ({
        step: mapDiagnosticStep(r.step),
        status: r.status,
      })),
    )
  } catch {
    return null
  }
}

export type RecordLdapAuthEventInput = Omit<LdapAuthEventRecord, 'id' | 'at'>

/** Insert one sanitized event (async, errors swallowed). */
export function recordLdapAuthEvent(input: RecordLdapAuthEventInput): void {
  void insertLdapAuthEvent({
    eventType:         input.eventType,
    action:            input.action,
    step:              input.step,
    result:            input.result,
    safeCode:          sanitizeLdapEventText(input.safeCode, 64),
    username:          sanitizeLdapUsername(input.username),
    provider:          'ldap',
    urlHost:           ldapUrlHostOnly(input.urlHost ?? undefined),
    baseDn:            sanitizeLdapEventText(input.baseDn, 256),
    renderedFilter:    sanitizeLdapEventText(input.renderedFilter, 400),
    ldapErrorName:     sanitizeLdapEventText(input.ldapErrorName, 64),
    ldapErrorCode:     input.ldapErrorCode != null ? sanitizeLdapEventText(String(input.ldapErrorCode), 16) : null,
    diagnosticMessage: sanitizeLdapEventText(input.diagnosticMessage, 500),
    matchedDn:         sanitizeLdapEventText(input.matchedDn, 256),
    referralsJson:     input.referralsJson,
    durationMs:        input.durationMs ?? null,
    requestIp:         sanitizeLdapEventText(input.requestIp, 64),
    userAgent:         sanitizeLdapEventText(input.userAgent, 200),
    stepResultsJson:   input.stepResultsJson,
  }).catch(() => { /* audit must not break auth */ })
}

export function recordLdapAuthEventFromTest(params: {
  action:      string
  diagnostic:  LdapTestDiagnostic
  dto:         AdminAuthProvidersDto['ldap']
  lookupUser?: string
  httpOk?:      boolean
  durationMs?: number
  requestIp?:   string
  userAgent?:   string
}): void {
  const { diagnostic: d, dto } = params
  recordLdapAuthEvent({
    eventType:         'test',
    action:            testActionFromLdapAction(params.action),
    step:              mapDiagnosticStep(d.step),
    result:            resultFromDiagnostic(d, params.httpOk),
    safeCode:          d.safeCode,
    username:          params.lookupUser ?? d.config.lookupUsername ?? null,
    urlHost:           ldapUrlHostOnly(dto.url),
    baseDn:            d.config.baseDn,
    renderedFilter:    d.renderedFilter ?? d.config.userFilter,
    ldapErrorName:     d.ldapErrorName ?? null,
    ldapErrorCode:     d.ldapErrorCode != null ? String(d.ldapErrorCode) : null,
    diagnosticMessage: d.diagnosticMessage ?? d.safeMessage,
    matchedDn:         d.matchedDN ?? null,
    referralsJson:     d.referrals?.length ? JSON.stringify(d.referrals.slice(0, 8)) : null,
    durationMs:        params.durationMs ?? null,
    requestIp:         params.requestIp ?? null,
    userAgent:         params.userAgent ?? null,
    stepResultsJson:   stepResultsToJson(d.stepResults),
  })
}

export function recordLdapLoginEvent(params: {
  step:              string
  result:            LdapAuthEventResult
  safeCode:          string
  username:          string
  dto:               AdminAuthProvidersDto['ldap']
  renderedFilter?:   string
  ldapErrorName?:    string | null
  ldapErrorCode?:    string | number | null
  diagnosticMessage?: string | null
  matchedDn?:        string | null
  referrals?:        string[]
  durationMs?:       number
  requestIp?:        string
  userAgent?:        string
}): void {
  recordLdapAuthEvent({
    eventType:         'login',
    action:            'login',
    step:              mapDiagnosticStep(params.step),
    result:            params.result,
    safeCode:          params.safeCode,
    username:          params.username,
    urlHost:           ldapUrlHostOnly(params.dto.url),
    baseDn:            params.dto.baseDn,
    renderedFilter:    params.renderedFilter ?? null,
    ldapErrorName:     params.ldapErrorName ?? null,
    ldapErrorCode:     params.ldapErrorCode != null ? String(params.ldapErrorCode) : null,
    diagnosticMessage: params.diagnosticMessage ?? null,
    matchedDn:         params.matchedDn ?? null,
    referralsJson:     params.referrals?.length ? JSON.stringify(params.referrals.slice(0, 8)) : null,
    durationMs:        params.durationMs ?? null,
    requestIp:         params.requestIp ?? null,
    userAgent:         params.userAgent ?? null,
    stepResultsJson:   null,
  })
}

export function recordLdapProvisioningEvent(params: {
  action:     'search' | 'provision'
  result:     LdapAuthEventResult
  safeCode:   string
  username?:  string
  dto:        AdminAuthProvidersDto['ldap']
  message?:   string
  durationMs?: number
  requestIp?: string
  userAgent?: string
  renderedFilter?: string
}): void {
  recordLdapAuthEvent({
    eventType:         'provisioning',
    action:            params.action,
    step:              params.action === 'search' ? 'userSearch' : 'provisioning',
    result:            params.result,
    safeCode:          params.safeCode,
    username:          params.username ?? null,
    urlHost:           ldapUrlHostOnly(params.dto.url),
    baseDn:            params.dto.baseDn,
    renderedFilter:    params.renderedFilter ?? null,
    diagnosticMessage: params.message ?? null,
    durationMs:        params.durationMs ?? null,
    requestIp:         params.requestIp ?? null,
    userAgent:         params.userAgent ?? null,
    stepResultsJson:   null,
  })
}

/** Format event for clipboard (no secrets). */
export function recordLdapLoginFromLdapError(params: {
  err:       unknown
  step:      LdapTestStep
  username:  string
  dto:       AdminAuthProvidersDto['ldap']
  filter:    string
  durationMs?: number
  requestIp?:  string
  userAgent?:  string
}): void {
  const identity = resolveLdapLoginIdentity(params.username, params.dto)
  const identityLog = ldapLoginIdentityDiagnosticMessage(identity)
  const config = buildLdapTestConfigSummary(params.dto, {
    username:            params.username,
    userFilter:          params.filter,
    rawUsername:         identity.rawUsername,
    accountName:         identity.accountName,
    userPrincipalName:   identity.userPrincipalName,
  })
  const d = buildLdapFailureDiagnostic(
    params.err,
    params.step,
    params.dto,
    config,
    [],
  )
  recordLdapLoginEvent({
    step:              params.step,
    result:            'failure',
    safeCode:          d.safeCode,
    username:          params.username,
    dto:               params.dto,
    renderedFilter:    params.filter,
    ldapErrorName:     d.ldapErrorName ?? null,
    ldapErrorCode:     d.ldapErrorCode ?? null,
    diagnosticMessage: d.diagnosticMessage ?? identityLog,
    matchedDn:         d.matchedDN ?? null,
    referrals:         d.referrals,
    durationMs:        params.durationMs,
    requestIp:         params.requestIp,
    userAgent:         params.userAgent,
  })
}
