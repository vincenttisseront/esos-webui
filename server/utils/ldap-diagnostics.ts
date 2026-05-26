/**
 * Safe LDAP test diagnostics for admin UI (no passwords/secrets).
 */
import type { AdminAuthProvidersDto } from './auth-providers-config'
import {
  filterTemplateHasLoginPlaceholder,
  ldapDefaultUpnSuffix,
  normalizeLdapLoginUsername,
} from './ldap-username-normalize'

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
  | 'tls_failed'
  | 'invalid_credentials'
  | 'operations_error'
  | 'timeout'
  | 'time_limit_exceeded'
  | 'size_limit_exceeded'
  | 'insufficient_access'
  | 'no_such_object'
  | 'filter_error'
  | 'strong_auth_required'
  | 'confidentiality_required'
  | 'referral'
  | 'connect_ok'
  | 'bind_ok'
  | 'search_ok'
  | 'user_not_found'
  | 'group_read_ok'
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
  | 'try_domain_root_base_dn'
  | 'try_upn_bind_format'
  | 'check_ad_referrals'
  | 'check_filter_syntax'
  | 'verify_memberof_read'
  | 'referrals_not_followed'
  | 'check_ldap_signing'
  | 'check_channel_binding'

export type LdapStepStatus = 'ok' | 'failed' | 'skipped' | 'pending'

export type LdapStepProgress = {
  step:   LdapTestStep
  status: LdapStepStatus
}

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
  lookupUsername?:      string
  rawUsername?:         string
  accountName?:         string
  userPrincipalName?:   string | null
}

export type LdapCommandExamples = {
  ldapsearch?: string
  openssl?:     string
}

export type LdapRootBaseDnProbe = {
  baseDn:     string
  ok:         boolean
  userFound?: boolean
  message?:   string
}

export type SearchRowPreview = {
  dn:                 string
  displayName:        string | null
  groupDns:           string[]
  groupAttrPresent:   boolean
  attributesPreview:  Record<string, string | string[]>
}

export type LdapTestDiagnostic = {
  step:           LdapTestStep
  ldapErrorName?: string
  ldapErrorCode?: string | number
  diagnosticMessage?: string
  matchedDN?:     string
  referrals?:     string[]
  safeMessage:    string
  safeCode:       LdapDiagnosticSafeCode
  renderedFilter?: string
  testedBaseDn?:  string
  testedBindPrincipalMasked?: string
  rootBaseDnProbe?: LdapRootBaseDnProbe
  searchResultPreview?: SearchRowPreview
  stepResults:    LdapStepProgress[]
  config:         LdapTestConfigSummary
  hints:          LdapDiagnosticHintId[]
  commandExamples?: LdapCommandExamples
}

export type LdapTestSuccess = {
  ok:                true
  bindOk:            boolean
  searchSampleCount: number
  bindOnly?:         boolean
  connectOnly?:      boolean
  userLookup?:       boolean
  groupReadOk?:      boolean
  groupOnly?:        boolean
  fullTest?:         boolean
  searchRootTest?:   boolean
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

/** Filter template with login placeholders (never a synthetic probe value). */
export function ldapUserSearchFilterTemplate(dto: AdminAuthProvidersDto['ldap']): string {
  const filter = dto.userSearchFilter.trim()
  if (filterTemplateHasLoginPlaceholder(filter)) return filter
  const attr = dto.usernameAttribute.trim() || 'username'
  return `(&${filter}(${attr}={{username}}))`
}

export function buildLdapTestConfigSummary(
  dto: AdminAuthProvidersDto['ldap'],
  options?: {
    username?:            string
    userFilter?:          string
    rawUsername?:         string
    accountName?:         string
    userPrincipalName?:   string | null
  },
): LdapTestConfigSummary {
  const filterTemplate = ldapUserSearchFilterTemplate(dto)
  const lookup = options?.username?.trim()
  const identity = lookup
    ? normalizeLdapLoginUsername(lookup, {
        defaultUpnSuffix: ldapDefaultUpnSuffix(dto.url ?? '', dto.baseDn ?? ''),
      })
    : null
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
    ...(lookup && identity
      ? {
          lookupUsername:    lookup,
          rawUsername:       options?.rawUsername ?? identity.rawUsername,
          accountName:       options?.accountName ?? identity.accountName,
          userPrincipalName: options?.userPrincipalName !== undefined
            ? options.userPrincipalName
            : identity.userPrincipalName,
        }
      : {}),
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

  let filter = config.userFilter
  if (filterTemplateHasLoginPlaceholder(filter)) {
    filter = filter
      .replace(/\{\{username\}\}/g, 'USERNAME')
      .replace(/\{\{accountName\}\}/g, 'ACCOUNTNAME')
      .replace(/\{\{userPrincipalName\}\}/g, 'user@example.com')
      .replace(/\{\{domainPrefix\}\}/g, 'DOMAIN')
  }

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
  ldapErrorName?:    string
  ldapErrorCode?:    string | number
  diagnosticMessage?: string
  matchedDN?:        string
  referrals?:        string[]
  rawMessage:        string
}

function extractReferralsFromMessage(msg: string): string[] | undefined {
  const refs: string[] = []
  const re = /ldap[s]?:\/\/[^\s,;]+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(msg)) !== null) {
    if (!refs.includes(m[0])) refs.push(m[0])
  }
  return refs.length ? refs : undefined
}

function parseLdapJsError(err: unknown): ParsedLdapError {
  const e = err as {
    name?:          string
    message?:       string
    code?:          string | number
    errno?:         string | number
    lde_errno?:     number
    lde_message?:   string
    matchedDN?:     string
    referral?:      string
    referrals?:     string[]
  }
  const ldapErrorName = e?.name?.trim() || undefined
  const ldapErrorCode = e?.lde_errno ?? e?.code ?? e?.errno
  const diagnosticMessage = (e?.lde_message ?? '').trim() || undefined
  const rawMessage
    = (diagnosticMessage ?? e?.message ?? (typeof err === 'string' ? err : '')).trim()
      || 'LDAP error'
  const matchedDN = e?.matchedDN?.trim() || undefined
  const fromMsg   = extractReferralsFromMessage(rawMessage)
  const referrals = e?.referrals?.length
    ? e.referrals
    : e?.referral
      ? [e.referral, ...(fromMsg ?? [])]
      : fromMsg
  return {
    ldapErrorName,
    ldapErrorCode: ldapErrorCode !== undefined ? ldapErrorCode : undefined,
    diagnosticMessage,
    matchedDN,
    referrals,
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
  if (code === 10 || name.includes('referral') || msg.includes('referral')) {
    return 'referral'
  }
  if (
    name.includes('operationserror')
    || msg.includes('operations error')
    || code === 1
  ) {
    return 'operations_error'
  }
  if (code === 4 || name.includes('sizelimitexceeded') || msg.includes('size limit exceeded')) {
    return 'size_limit_exceeded'
  }
  if (code === 3 || name.includes('timelimitexceeded') || msg.includes('time limit exceeded')) {
    return 'time_limit_exceeded'
  }
  if (code === 8 || name.includes('strongauthrequired') || msg.includes('stronger authentication')) {
    return 'strong_auth_required'
  }
  if (code === 13 || name.includes('confidentialityrequired') || msg.includes('confidentiality required')) {
    return 'confidentiality_required'
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
    || msg.includes('certificate')
    || msg.includes('tls')
  ) {
    if (step === 'starttls' || msg.includes('starttls')) return 'starttls_failed'
    if (msg.includes('certificate') || msg.includes('tls')) return 'tls_failed'
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

function hintsForSafeCode(
  code: LdapDiagnosticSafeCode,
  config: LdapTestConfigSummary,
  failedStep?: LdapTestStep,
): LdapDiagnosticHintId[] {
  const hints: LdapDiagnosticHintId[] = []

  if (code === 'operations_error') {
    hints.push(
      'try_domain_root_base_dn',
      'try_upn_bind_format',
      'verify_base_dn',
      'verify_search_filter',
      'check_filter_syntax',
      'verify_service_account_read',
      'verify_bind_format',
      'check_ldap_signing',
      'check_channel_binding',
      'use_ldaps_or_starttls',
      'check_tls_certificate',
      'check_hostname_sni',
      'check_ad_referrals',
      'referrals_not_followed',
      'verify_memberof_read',
    )
    return hints
  }

  if (code === 'referral') {
    hints.push('check_ad_referrals', 'referrals_not_followed', 'try_domain_root_base_dn', 'use_ldaps_or_starttls')
    return hints
  }

  if (code === 'strong_auth_required' || code === 'confidentiality_required') {
    hints.push('use_ldaps_or_starttls', 'check_tls_certificate', 'check_hostname_sni')
  }
  if (code === 'invalid_credentials' || code === 'bind_password_missing') {
    hints.push('verify_bind_format', 'verify_bind_password', 'try_upn_bind_format')
  }
  if (code === 'connection_failed' || code === 'starttls_failed' || code === 'tls_failed') {
    hints.push('use_ldaps_or_starttls', 'check_tls_certificate', 'check_hostname_sni', 'verify_timeout')
  }
  if (code === 'insufficient_access') {
    hints.push('verify_service_account_read', 'verify_bind_format', 'try_upn_bind_format')
  }
  if (code === 'no_such_object') {
    hints.push('verify_base_dn', 'try_domain_root_base_dn')
  }
  if (code === 'filter_error') {
    hints.push('verify_search_filter', 'check_filter_syntax')
  }
  if (code === 'timeout' || code === 'time_limit_exceeded') {
    hints.push('verify_timeout')
  }
  if (code === 'size_limit_exceeded') {
    hints.push('verify_search_filter', 'verify_base_dn')
  }
  if (code === 'config_incomplete') {
    hints.push('verify_base_dn', 'verify_bind_format', 'verify_search_filter')
  }
  if (failedStep === 'userSearch' && !hints.includes('verify_base_dn')) {
    hints.push('verify_base_dn', 'try_domain_root_base_dn')
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
    case 'tls_failed':
      return 'TLS handshake failed (LDAPS or StartTLS).'
    case 'invalid_credentials':
      return 'Bind failed: invalid credentials or bind principal format.'
    case 'operations_error':
      return 'LDAP Operations Error — common with Active Directory when signing, channel binding, bind format, or base DN is incorrect.'
    case 'timeout':
      return 'LDAP operation timed out.'
    case 'time_limit_exceeded':
      return 'LDAP server time limit exceeded for the search.'
    case 'size_limit_exceeded':
      return 'LDAP search returned too many entries (size limit exceeded).'
    case 'insufficient_access':
      return 'Insufficient access rights for this operation.'
    case 'no_such_object':
      return 'Base DN or search path not found.'
    case 'filter_error':
      return 'User search filter is invalid.'
    case 'strong_auth_required':
      return 'Strong authentication required (often LDAP signing or channel binding on Active Directory).'
    case 'confidentiality_required':
      return 'Confidentiality required — use LDAPS or StartTLS.'
    case 'referral':
      return 'LDAP referral returned — the server pointed to another directory partition.'
    case 'connect_ok':
      return 'Connection and TLS check succeeded. Bind was not attempted.'
    case 'bind_ok':
      return 'Service account bind succeeded. User search was not run.'
    case 'search_ok':
      return 'Bind and user search succeeded.'
    case 'user_not_found':
      return 'Bind and search succeeded but no user matched the lookup identifier.'
    case 'group_read_ok':
      return 'Group membership attribute read succeeded.'
    default:
      return parsed.rawMessage.slice(0, 240) || 'LDAP test failed.'
  }
}

export const LDAP_TEST_PIPELINE: LdapTestStep[] = [
  'connection',
  'starttls',
  'bind',
  'userSearch',
  'groupRead',
]

export function ldapTlsStepNeeded(urlStr: string, startTls: boolean): boolean {
  const u = urlStr.trim().toLowerCase()
  return u.startsWith('ldaps://') || (u.startsWith('ldap://') && startTls)
}

export function buildInitialStepResults(
  urlStr: string,
  startTls: boolean,
  includeBind = true,
  includeSearch = false,
): LdapStepProgress[] {
  const tlsNeeded = ldapTlsStepNeeded(urlStr, startTls)
  return LDAP_TEST_PIPELINE.map((step) => {
    if (step === 'starttls' && !tlsNeeded) return { step, status: 'skipped' as const }
    if (step === 'bind' && !includeBind) return { step, status: 'skipped' as const }
    if ((step === 'userSearch' || step === 'groupRead') && !includeSearch) {
      return { step, status: 'skipped' as const }
    }
    return { step, status: 'pending' as const }
  })
}

export function markStepOk(results: LdapStepProgress[], step: LdapTestStep): void {
  const row = results.find((r) => r.step === step)
  if (row) row.status = 'ok'
}

export function markStepFailed(results: LdapStepProgress[], step: LdapTestStep): void {
  const row = results.find((r) => r.step === step)
  if (row) row.status = 'failed'
  const idx = LDAP_TEST_PIPELINE.indexOf(step)
  for (let i = idx + 1; i < LDAP_TEST_PIPELINE.length; i++) {
    const later = results.find((r) => r.step === LDAP_TEST_PIPELINE[i])
    if (later && later.status === 'pending') later.status = 'skipped'
  }
}

function enrichDiagnosticFields(
  config: LdapTestConfigSummary,
  extra?: { renderedFilter?: string },
): Pick<LdapTestDiagnostic, 'testedBaseDn' | 'testedBindPrincipalMasked' | 'renderedFilter'> {
  return {
    testedBaseDn:               config.baseDn,
    testedBindPrincipalMasked:  config.bindPrincipal,
    ...(extra?.renderedFilter ? { renderedFilter: extra.renderedFilter } : {}),
  }
}

export function buildLdapFailureDiagnostic(
  err: unknown,
  step: LdapTestStep,
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
  stepResults: LdapStepProgress[],
): LdapTestDiagnostic {
  const parsed   = parseLdapJsError(err)
  const safeCode = inferSafeCode(parsed, step)
  markStepFailed(stepResults, step)
  return {
    step,
    ldapErrorName: parsed.ldapErrorName,
    ldapErrorCode: parsed.ldapErrorCode,
    diagnosticMessage: parsed.diagnosticMessage,
    matchedDN:     parsed.matchedDN,
    referrals:     parsed.referrals,
    safeCode,
    safeMessage:   ldapSafeMessageForCode(safeCode, parsed),
    stepResults,
    config,
    hints:         hintsForSafeCode(safeCode, config, step),
    commandExamples: buildLdapCommandExamples(dto, config),
    ...enrichDiagnosticFields(config, {
      renderedFilter: filterTemplateHasLoginPlaceholder(config.userFilter)
        ? undefined
        : config.userFilter,
    }),
  }
}

export function buildLdapValidationFailure(
  step: LdapTestStep,
  safeCode: LdapDiagnosticSafeCode,
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
  stepResults: LdapStepProgress[],
): LdapTestFailure {
  const parsed = { rawMessage: ldapSafeMessageForCode(safeCode, { rawMessage: '' }) }
  markStepFailed(stepResults, step)
  return {
    ok: false,
    diagnostic: {
      step,
      safeCode,
      safeMessage: parsed.rawMessage,
      stepResults,
      config,
      hints:       hintsForSafeCode(safeCode, config, step),
      commandExamples: buildLdapCommandExamples(dto, config),
      ...enrichDiagnosticFields(config),
    },
  }
}

export function buildLdapConnectSuccessDiagnostic(
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
  stepResults: LdapStepProgress[],
): LdapTestDiagnostic {
  return {
    step:        'connection',
    safeCode:    'connect_ok',
    safeMessage: ldapSafeMessageForCode('connect_ok', { rawMessage: '' }),
    stepResults,
    config,
    hints:       [],
    commandExamples: buildLdapCommandExamples(dto, config),
    ...enrichDiagnosticFields(config),
  }
}

export function buildLdapBindOnlySuccessDiagnostic(
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
  stepResults: LdapStepProgress[],
): LdapTestDiagnostic {
  return {
    step:        'bind',
    safeCode:    'bind_ok',
    safeMessage: ldapSafeMessageForCode('bind_ok', { rawMessage: '' }),
    stepResults,
    config,
    hints:       [],
    commandExamples: buildLdapCommandExamples(dto, config),
    ...enrichDiagnosticFields(config),
  }
}

export function buildLdapSearchSuccessDiagnostic(
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
  _searchSampleCount: number,
  stepResults: LdapStepProgress[],
  renderedFilter: string,
): LdapTestDiagnostic {
  return {
    step:        'userSearch',
    safeCode:    'search_ok',
    safeMessage: ldapSafeMessageForCode('search_ok', { rawMessage: '' }),
    stepResults,
    config,
    hints:       [],
    commandExamples: buildLdapCommandExamples(dto, config),
    ...enrichDiagnosticFields(config, { renderedFilter }),
  }
}

export function buildLdapUserNotFoundDiagnostic(
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
  stepResults: LdapStepProgress[],
  renderedFilter: string,
): LdapTestDiagnostic {
  return {
    step:        'userSearch',
    safeCode:    'user_not_found',
    safeMessage: ldapSafeMessageForCode('user_not_found', { rawMessage: '' }),
    stepResults,
    config,
    hints:       ['verify_search_filter', 'verify_base_dn', 'try_domain_root_base_dn'],
    commandExamples: buildLdapCommandExamples(dto, config),
    ...enrichDiagnosticFields(config, { renderedFilter }),
  }
}

/** @deprecated Use buildLdapBindOnlySuccessDiagnostic / buildLdapSearchSuccessDiagnostic */
export function buildLdapSuccessDiagnostic(
  dto: AdminAuthProvidersDto['ldap'],
  config: LdapTestConfigSummary,
  searchSampleCount: number,
  userLookup?: boolean,
  stepResults: LdapStepProgress[] = buildInitialStepResults(dto.url ?? '', dto.startTls, true, userLookup !== undefined),
): LdapTestDiagnostic {
  if (userLookup === false) {
    return buildLdapUserNotFoundDiagnostic(dto, config, stepResults, config.userFilter)
  }
  if (userLookup === true) {
    return buildLdapSearchSuccessDiagnostic(dto, config, searchSampleCount, stepResults, config.userFilter)
  }
  return buildLdapBindOnlySuccessDiagnostic(dto, config, stepResults)
}

/** Safe server log line (no passwords). DB audit is recorded separately via `recordLdapAuthEventFromTest`. */
export function logLdapTestSafe(
  action: string,
  dto: AdminAuthProvidersDto['ldap'],
  diagnostic: LdapTestDiagnostic,
): void {
  console.info('[ldap-test]', JSON.stringify({
    action,
    step:      diagnostic.step,
    safeCode:  diagnostic.safeCode,
    host:      (() => {
      try {
        const u = dto.url?.trim()
        if (!u) return ''
        return new URL(u.includes('://') ? u : `ldap://${u}`).host
      } catch {
        return ''
      }
    })(),
    baseDn:    dto.baseDn?.trim() || '',
    errorName: diagnostic.ldapErrorName ?? null,
    errorCode: diagnostic.ldapErrorCode ?? null,
  }))
}

/** Plain-text block for “Copy LDAP diagnostic” (no secrets). */
export function formatLdapDiagnosticForCopy(d: LdapTestDiagnostic, lines: {
  stepLabel:      string
  summaryLabel:   string
  failedStep:     string
  safeMessage:    string
  errorName?:     string
  errorCode?:     string
  diagnosticMessage?: string
  matchedDN?:     string
  referrals?:     string
  renderedFilter?: string
  stepProgressTitle?: string
  stepProgressLines?: string[]
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
  if (lines.diagnosticMessage && d.diagnosticMessage) {
    out.push(`${lines.diagnosticMessage}: ${d.diagnosticMessage}`)
  }
  if (lines.matchedDN && d.matchedDN) {
    out.push(`${lines.matchedDN}: ${d.matchedDN}`)
  }
  if (lines.referrals && d.referrals?.length) {
    out.push(`${lines.referrals}: ${d.referrals.join(', ')}`)
  }
  if (lines.renderedFilter && (d.renderedFilter ?? d.config.userFilter)) {
    out.push(`${lines.renderedFilter}: ${d.renderedFilter ?? d.config.userFilter}`)
  }
  if (lines.stepProgressLines?.length) {
    out.push('', lines.stepProgressTitle ?? 'Steps')
    for (const s of lines.stepProgressLines) out.push(`  ${s}`)
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
  if (d.config.rawUsername) {
    out.push(`  Raw username: ${d.config.rawUsername}`)
  }
  if (d.config.accountName) {
    out.push(`  Account name: ${d.config.accountName}`)
  }
  if (d.config.userPrincipalName) {
    out.push(`  UPN: ${d.config.userPrincipalName}`)
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
