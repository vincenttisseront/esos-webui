/**
 * Safe LDAP test diagnostics for admin UI (no passwords/secrets).
 */
import type { AdminAuthProvidersDto } from './auth-providers-config'

export type LdapConnectionModeKind =
  | 'ldaps'
  | 'ldap_start_tls'
  | 'ldap_localhost_plain'
  | 'ldap_plain_remote'
  | 'empty'
  | 'unknown_url'

function ldapTlsModeFromUrl(urlStr: string, startTls: boolean): LdapConnectionModeKind {
  const u = urlStr.trim().toLowerCase()
  if (u.startsWith('ldaps://')) return 'ldaps'
  if (u.startsWith('ldap://')) {
    try {
      const h = new URL(urlStr.includes('://') ? urlStr : `ldap://${urlStr}`).hostname.toLowerCase()
      if (h === 'localhost' || h === '127.0.0.1') return 'ldap_localhost_plain'
    } catch { /* ignore */ }
    if (startTls) return 'ldap_start_tls'
    return 'ldap_plain_remote'
  }
  if (!u) return 'empty'
  return 'unknown_url'
}

export type LdapTestStep =
  | 'config'
  | 'connection'
  | 'starttls'
  | 'bind'
  | 'userSearch'
  | 'groupRead'

export type LdapDiagnosticSafeCode =
  | 'config_incomplete'
  | 'bind_password_missing'
  | 'tls_policy_rejected'
  | 'connection_failed'
  | 'starttls_failed'
  | 'invalid_credentials'
  | 'operations_error'
  | 'timeout'
  | 'insufficient_access'
  | 'no_such_object'
  | 'filter_error'
  | 'bind_ok'
  | 'search_ok'
  | 'user_not_found'
  | 'unknown'

/** Stable hint ids → i18n `admin.authProviders.ldap.diagnostics.hints.<id>` */
export type LdapDiagnosticHintId =
  | 'use_ldaps_or_starttls'
  | 'verify_bind_format'
  | 'verify_base_dn'
  | 'verify_search_filter'
  | 'verify_service_account_read'
  | 'check_tls_certificate'
  | 'check_hostname_sni'
  | 'verify_timeout'
  | 'verify_bind_password'

export type LdapTestConfigSummary = {
  serverUrl:      string
  tlsMode:        LdapConnectionModeKind
  verifyTls:      boolean
  bindPrincipal:  string
  baseDn:         string
  userFilter:     string
  loginAttribute: string
  groupAttribute: string
  timeoutSec:     number
  lookupUsername?: string
}

export type LdapCommandExamples = {
  ldapsearch?: string
  openssl?:     string
}

export type LdapTestDiagnostic = {
  step:           LdapTestStep
  ldapErrorName?: string
  ldapErrorCode?: string | number
  safeMessage:    string
  safeCode:       LdapDiagnosticSafeCode
  config:         LdapTestConfigSummary
  hints:          LdapDiagnosticHintId[]
  commandExamples?: LdapCommandExamples
}

export type LdapTestSuccess = {
  ok:                true
  bindOk:            boolean
  searchSampleCount: number
  bindOnly?:         boolean
  userLookup?:       boolean
  diagnostic:        LdapTestDiagnostic
}

export type LdapTestFailure = {
  ok:         false
  diagnostic: LdapTestDiagnostic
}

export type LdapTestResult = LdapTestSuccess | LdapTestFailure

/** Mask bind DN / UPN for display (never expose password). */
export function maskBindPrincipal(bindDn: string): string {
  const s = bindDn.trim()
  if (!s) return '—'
  if (s.includes('@')) {
    const [user, domain] = s.split('@')
    const u = user ?? ''
    const masked = u.length <= 1 ? '*' : `${u[0]}${'*'.repeat(Math.min(6, Math.max(1, u.length - 1)))}`
    return `${masked}@${domain ?? '***'}`
  }
  if (s.includes('\\')) {
    const idx = s.indexOf('\\')
    return `${s.slice(0, idx + 1)}***`
  }
  if (/^cn=/i.test(s)) {
    return s.replace(/^(cn=)[^,]+/i, '$1***')
  }
  if (s.length <= 4) return '***'
  return `${s.slice(0, 3)}***`
}

/** Filter template with {{username}} placeholder (never a synthetic probe value). */
export function ldapUserSearchFilterTemplate(dto: AdminAuthProvidersDto['ldap']): string {
  const filter = dto.userSearchFilter.trim()
  if (filter.includes('{{username}}')) return filter
  const attr = dto.usernameAttribute.trim() || 'username'
  return `(&${filter}(${attr}={{username}}))`
}

export function buildLdapTestConfigSummary(
  dto: AdminAuthProvidersDto['ldap'],
  options?: { username?: string; userFilter?: string },
): LdapTestConfigSummary {
  const filterTemplate = ldapUserSearchFilterTemplate(dto)
  return {
    serverUrl:      dto.url?.trim() || '—',
    tlsMode:        ldapTlsModeFromUrl(dto.url ?? '', dto.startTls),
    verifyTls:      dto.tlsVerify,
    bindPrincipal:  maskBindPrincipal(dto.bindDn ?? ''),
    baseDn:         dto.baseDn?.trim() || '—',
    userFilter:     (options?.userFilter ?? filterTemplate)?.trim() || '—',
    loginAttribute: dto.usernameAttribute?.trim() || '—',
    groupAttribute: dto.groupAttribute?.trim() || '—',
    timeoutSec:     dto.timeoutSec,
    ...(options?.username?.trim() ? { lookupUsername: options.username.trim() } : {}),
  }
}

function ldapHostnameFromUrl(urlStr: string): string | null {
  const trimmed = urlStr.trim()
  if (!trimmed) return null
  const normalized = trimmed.includes('://') ? trimmed : `ldap://${trimmed}`
  try {
    return new URL(normalized).hostname
  } catch {
    return null
  }
}

function ldapPortFromUrl(urlStr: string, startTls: boolean): number {
  const trimmed = urlStr.trim()
  if (!trimmed) return startTls ? 389 : 636
  const normalized = trimmed.includes('://') ? trimmed : `ldap://${trimmed}`
  try {
    const u = new URL(normalized)
    if (u.port) return parseInt(u.port, 10)
    return u.protocol === 'ldaps:' ? 636 : 389
  } catch {
    return 389
  }
}

export function buildLdapCommandExamples(
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
): LdapCommandExamples {
  const host = ldapHostnameFromUrl(dto.url)
  if (!host) return {}
  const port   = ldapPortFromUrl(dto.url, dto.startTls)
  const scheme = dto.url.trim().toLowerCase().startsWith('ldaps://') ? 'ldaps' : 'ldap'
  const uri    = `${scheme}://${host}:${port}`

  const filter = config.userFilter.includes('{{username}}')
    ? config.userFilter.replace(/\{\{username\}\}/g, 'USERNAME')
    : config.userFilter

  const bindForCli = dto.bindDn.includes('"') ? dto.bindDn : `"${dto.bindDn}"`

  const ldapsearch = [
    'ldapsearch',
    `-H ${uri}`,
    `-D ${bindForCli}`,
    '-W',
    `-b "${config.baseDn}"`,
    `"${filter}"`,
    config.groupAttribute,
  ].join(' ')

  const openssl = dto.url.trim().toLowerCase().startsWith('ldaps://')
    ? `openssl s_client -connect ${host}:${port} -servername ${host}`
    : dto.startTls
      ? `openssl s_client -connect ${host}:${port} -starttls ldap -servername ${host}`
      : undefined

  return {
    ldapsearch,
    ...(openssl ? { openssl } : {}),
  }
}

type ParsedLdapError = {
  ldapErrorName?: string
  ldapErrorCode?: string | number
  rawMessage:     string
}

function parseLdapJsError(err: unknown): ParsedLdapError {
  const e = err as {
    name?:     string
    message?:  string
    code?:     string | number
    errno?:    string | number
    lde_errno?: number
    lde_message?: string
  }
  const ldapErrorName = e?.name?.trim() || undefined
  const ldapErrorCode = e?.lde_errno ?? e?.code ?? e?.errno
  const rawMessage
    = (e?.lde_message ?? e?.message ?? (typeof err === 'string' ? err : '')).trim()
      || 'LDAP error'
  return {
    ldapErrorName,
    ldapErrorCode: ldapErrorCode !== undefined ? ldapErrorCode : undefined,
    rawMessage,
  }
}

function inferSafeCode(parsed: ParsedLdapError, step: LdapTestStep): LdapDiagnosticSafeCode {
  const name = (parsed.ldapErrorName ?? '').toLowerCase()
  const msg  = parsed.rawMessage.toLowerCase()
  const code = parsed.ldapErrorCode

  if (code === 49 || name.includes('invalidcredentials') || msg.includes('invalid credentials')) {
    return 'invalid_credentials'
  }
  if (
    name.includes('operationserror')
    || msg.includes('operations error')
    || code === 1
  ) {
    return 'operations_error'
  }
  if (name.includes('timeout') || msg.includes('timeout') || code === 85) {
    return 'timeout'
  }
  if (
    name.includes('insufficientaccess')
    || msg.includes('insufficient access')
    || code === 50
  ) {
    return 'insufficient_access'
  }
  if (name.includes('nosuchobject') || msg.includes('no such object') || code === 32) {
    return 'no_such_object'
  }
  if (msg.includes('filter') && (msg.includes('invalid') || msg.includes('syntax'))) {
    return 'filter_error'
  }
  if (
    step === 'connection'
    || msg.includes('econnrefused')
    || msg.includes('enotfound')
    || msg.includes('getaddrinfo')
    || msg.includes('connect')
  ) {
    return 'connection_failed'
  }
  if (step === 'starttls' || msg.includes('starttls')) {
    return 'starttls_failed'
  }
  if (step === 'bind' && (msg.includes('bind') || code === 49)) {
    return 'invalid_credentials'
  }
  return 'unknown'
}

function hintsForSafeCode(code: LdapDiagnosticSafeCode, config: LdapTestConfigSummary): LdapDiagnosticHintId[] {
  const hints: LdapDiagnosticHintId[] = []

  if (code === 'operations_error') {
    hints.push(
      'use_ldaps_or_starttls',
      'verify_bind_format',
      'verify_base_dn',
      'verify_search_filter',
      'verify_service_account_read',
      'check_tls_certificate',
      'check_hostname_sni',
    )
    return hints
  }

  if (code === 'invalid_credentials' || code === 'bind_password_missing') {
    hints.push('verify_bind_format', 'verify_bind_password')
  }
  if (code === 'connection_failed' || code === 'starttls_failed') {
    hints.push('use_ldaps_or_starttls', 'check_tls_certificate', 'check_hostname_sni', 'verify_timeout')
  }
  if (code === 'insufficient_access') {
    hints.push('verify_service_account_read', 'verify_bind_format')
  }
  if (code === 'no_such_object') {
    hints.push('verify_base_dn')
  }
  if (code === 'filter_error') {
    hints.push('verify_search_filter')
  }
  if (code === 'timeout') {
    hints.push('verify_timeout')
  }
  if (code === 'config_incomplete') {
    hints.push('verify_base_dn', 'verify_bind_format', 'verify_search_filter')
  }

  if (
    config.tlsMode === 'ldap_plain_remote'
    && !hints.includes('use_ldaps_or_starttls')
  ) {
    hints.push('use_ldaps_or_starttls')
  }

  return [...new Set(hints)]
}

/** User-visible safe message (English technical baseline; UI uses safeCode + i18n). */
export function ldapSafeMessageForCode(code: LdapDiagnosticSafeCode, parsed: ParsedLdapError): string {
  switch (code) {
    case 'config_incomplete':
      return 'LDAP configuration is incomplete (URL, base DN, or bind principal missing).'
    case 'bind_password_missing':
      return 'Bind password is not configured on the server.'
    case 'tls_policy_rejected':
      return 'TLS policy rejected for this URL (production requires LDAPS or StartTLS).'
    case 'connection_failed':
      return 'Could not connect to the LDAP server.'
    case 'starttls_failed':
      return 'StartTLS negotiation failed.'
    case 'invalid_credentials':
      return 'Bind failed: invalid credentials or bind principal format.'
    case 'operations_error':
      return 'LDAP Operations Error — common with Active Directory when signing, channel binding, or bind format is incorrect.'
    case 'timeout':
      return 'LDAP operation timed out.'
    case 'insufficient_access':
      return 'Insufficient access rights for this operation.'
    case 'no_such_object':
      return 'Base DN or search path not found.'
    case 'filter_error':
      return 'User search filter is invalid.'
    case 'bind_ok':
      return 'Service account bind succeeded. User search was not run.'
    case 'search_ok':
      return 'Bind and user search succeeded.'
    case 'user_not_found':
      return 'Bind and search succeeded but no user matched the lookup identifier.'
    default:
      return parsed.rawMessage.slice(0, 240) || 'LDAP test failed.'
  }
}

export function buildLdapFailureDiagnostic(
  err: unknown,
  step: LdapTestStep,
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
): LdapTestDiagnostic {
  const parsed   = parseLdapJsError(err)
  const safeCode = inferSafeCode(parsed, step)
  return {
    step,
    ldapErrorName: parsed.ldapErrorName,
    ldapErrorCode: parsed.ldapErrorCode,
    safeCode,
    safeMessage:   ldapSafeMessageForCode(safeCode, parsed),
    config,
    hints:         hintsForSafeCode(safeCode, config),
    commandExamples: buildLdapCommandExamples(dto, config),
  }
}

export function buildLdapValidationFailure(
  step: LdapTestStep,
  safeCode: LdapDiagnosticSafeCode,
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
): LdapTestFailure {
  const parsed = { rawMessage: ldapSafeMessageForCode(safeCode, { rawMessage: '' }) }
  return {
    ok: false,
    diagnostic: {
      step,
      safeCode,
      safeMessage: parsed.rawMessage,
      config,
      hints:       hintsForSafeCode(safeCode, config),
      commandExamples: buildLdapCommandExamples(dto, config),
    },
  }
}

export function buildLdapBindOnlySuccessDiagnostic(
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
): LdapTestDiagnostic {
  return {
    step:        'bind',
    safeCode:    'bind_ok',
    safeMessage: ldapSafeMessageForCode('bind_ok', { rawMessage: '' }),
    config,
    hints:       [],
    commandExamples: buildLdapCommandExamples(dto, config),
  }
}

export function buildLdapSearchSuccessDiagnostic(
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
  searchSampleCount: number,
): LdapTestDiagnostic {
  return {
    step:        'userSearch',
    safeCode:    'search_ok',
    safeMessage: ldapSafeMessageForCode('search_ok', { rawMessage: '' }),
    config,
    hints:       [],
    commandExamples: buildLdapCommandExamples(dto, config),
  }
}

export function buildLdapUserNotFoundDiagnostic(
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
): LdapTestDiagnostic {
  return {
    step:        'userSearch',
    safeCode:    'user_not_found',
    safeMessage: ldapSafeMessageForCode('user_not_found', { rawMessage: '' }),
    config,
    hints:       ['verify_search_filter', 'verify_base_dn'],
    commandExamples: buildLdapCommandExamples(dto, config),
  }
}

/** @deprecated Use buildLdapBindOnlySuccessDiagnostic / buildLdapSearchSuccessDiagnostic */
export function buildLdapSuccessDiagnostic(
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
  searchSampleCount: number,
  userLookup?: boolean,
): LdapTestDiagnostic {
  if (userLookup === false) {
    return buildLdapUserNotFoundDiagnostic(dto, config)
  }
  if (userLookup === true) {
    return buildLdapSearchSuccessDiagnostic(dto, config, searchSampleCount)
  }
  return buildLdapBindOnlySuccessDiagnostic(dto, config)
}

/** Plain-text block for “Copy LDAP diagnostic” (no secrets). */
export function formatLdapDiagnosticForCopy(d: LdapTestDiagnostic, lines: {
  stepLabel:      string
  summaryLabel:   string
  failedStep:     string
  safeMessage:    string
  errorName?:     string
  errorCode?:     string
  configTitle:    string
  hintsTitle?:    string
  hintLines?:     string[]
  commandsTitle?: string
  commandLines?:  string[]
}): string {
  const out: string[] = [
    lines.summaryLabel,
    `${lines.failedStep}: ${lines.stepLabel}`,
    `${lines.safeMessage}: ${d.safeMessage}`,
  ]
  if (lines.errorName && d.ldapErrorName) {
    out.push(`${lines.errorName}: ${d.ldapErrorName}`)
  }
  if (lines.errorCode != null && d.ldapErrorCode !== undefined) {
    out.push(`${lines.errorCode}: ${d.ldapErrorCode}`)
  }
  out.push('', lines.configTitle)
  out.push(`  URL: ${d.config.serverUrl}`)
  out.push(`  TLS: ${d.config.tlsMode} (verify cert: ${d.config.verifyTls})`)
  out.push(`  Bind: ${d.config.bindPrincipal}`)
  out.push(`  Base DN: ${d.config.baseDn}`)
  out.push(`  Filter: ${d.config.userFilter}`)
  out.push(`  Login attr: ${d.config.loginAttribute}`)
  out.push(`  Group attr: ${d.config.groupAttribute}`)
  out.push(`  Timeout: ${d.config.timeoutSec}s`)
  if (d.config.lookupUsername) {
    out.push(`  Lookup user: ${d.config.lookupUsername}`)
  }
  if (lines.hintLines?.length) {
    out.push('', lines.hintsTitle ?? 'Hints')
    for (const h of lines.hintLines) out.push(`  - ${h}`)
  }
  if (lines.commandLines?.length) {
    out.push('', lines.commandsTitle ?? 'Commands')
    for (const c of lines.commandLines) out.push(`  ${c}`)
  }
  return out.join('\n')
}
