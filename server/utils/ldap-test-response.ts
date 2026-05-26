/**
 * Structured LDAP test API response (sanitized, no secrets).
 */
import type { AdminAuthProvidersDto } from './auth-providers-config'
import {
  domainRootDnFromDn,
  domainRootDnFromUrl,
  suggestNetbiosBindFromDn,
  suggestUpnBindFromDn,
} from './ldap-ad-defaults'
import type {
  LdapDiagnosticSafeCode,
  LdapDiagnosticHintId,
  LdapStepProgress,
  LdapStepStatus,
  LdapTestDiagnostic,
  LdapTestResult,
  SearchRowPreview,
} from './ldap-diagnostics'

export type LdapErrorCategory =
  | 'invalidCredentials'
  | 'tlsFailure'
  | 'operationsError'
  | 'noSuchObject'
  | 'insufficientAccess'
  | 'timeout'
  | 'filterSyntax'
  | 'noResults'
  | 'referrals'
  | 'unknown'

export type LdapProgressStep = 'connection' | 'tls' | 'bind' | 'userSearch' | 'groupRead'

export type LdapFailedStep = LdapProgressStep | 'config' | null

export type LdapSuggestionActionType =
  | 'applyRootBaseDn'
  | 'applyAdFilter'
  | 'applyUpnBind'
  | 'applyBindNetbios'
  | 'applyAdPreset'
  | 'testRootBaseDn'
  | 'copyDiagnostic'

export type LdapTestSuggestion = {
  key:         LdapDiagnosticHintId | 'root_base_dn_probe_ok' | 'root_base_dn_probe_failed'
  actionType?: LdapSuggestionActionType
  payload?:    Record<string, string>
}

export type LdapStructuredTestResponse = {
  ok:         boolean
  failedStep: LdapFailedStep
  progress:   Record<LdapProgressStep, LdapStepStatus>
  configTested: {
    url:                 string
    tlsMode:             string
    verifyTls:           boolean
    bindPrincipalMasked: string
    baseDn:              string
    renderedFilter?:     string
    loginAttr:           string
    displayAttr:         string
    groupAttr:           string
    timeout:             number
    lookupUser?:         string
  }
  result?: {
    userFound:          boolean
    dn?:                string
    attributesPreview?: Record<string, string | string[]>
    groupsCount?:     number
  }
  error?: {
    category:           LdapErrorCategory
    ldapName?:          string
    ldapCode?:          string | number
    message:            string
    diagnosticMessage?: string
    matchedDN?:         string
    referrals?:         string[]
  }
  rootBaseDnProbe?: {
    baseDn:      string
    ok:          boolean
    userFound?:  boolean
    message?:    string
  }
  suggestions: LdapTestSuggestion[]
  commands?: {
    ldapsearch?: string
    openssl?:     string
  }
  /** Legacy diagnostic blob for existing UI components. */
  diagnostic: LdapTestDiagnostic
  bindOk?:            boolean
  searchSampleCount?: number
  bindOnly?:          boolean
  connectOnly?:       boolean
  userLookup?:        boolean
  groupReadOk?:       boolean
  errorMessage?:      string
}

export function ldapSafeCodeToCategory(code: LdapDiagnosticSafeCode): LdapErrorCategory {
  switch (code) {
    case 'invalid_credentials':
    case 'bind_password_missing':
      return 'invalidCredentials'
    case 'connection_failed':
    case 'starttls_failed':
    case 'tls_failed':
    case 'tls_policy_rejected':
    case 'strong_auth_required':
    case 'confidentiality_required':
      return 'tlsFailure'
    case 'operations_error':
      return 'operationsError'
    case 'no_such_object':
      return 'noSuchObject'
    case 'insufficient_access':
      return 'insufficientAccess'
    case 'timeout':
    case 'time_limit_exceeded':
    case 'size_limit_exceeded':
      return 'timeout'
    case 'filter_error':
      return 'filterSyntax'
    case 'user_not_found':
      return 'noResults'
    case 'referral':
      return 'referrals'
    default:
      return 'unknown'
  }
}

function mapProgress(stepResults: LdapStepProgress[]): Record<LdapProgressStep, LdapStepStatus> {
  const out: Record<LdapProgressStep, LdapStepStatus> = {
    connection: 'skipped',
    tls:        'skipped',
    bind:       'skipped',
    userSearch: 'skipped',
    groupRead:  'skipped',
  }
  for (const row of stepResults) {
    if (row.step === 'starttls') out.tls = row.status
    else if (row.step in out) out[row.step as LdapProgressStep] = row.status
  }
  return out
}

function mapFailedStep(step: LdapTestDiagnostic['step'], ok: boolean): LdapFailedStep {
  if (ok) return null
  if (step === 'starttls') return 'tls'
  if (step === 'config') return null
  if (step === 'connection' || step === 'bind' || step === 'userSearch' || step === 'groupRead') {
    return step
  }
  return null
}

const HINT_ACTIONS: Partial<Record<LdapDiagnosticHintId, LdapSuggestionActionType>> = {
  try_domain_root_base_dn: 'applyRootBaseDn',
  verify_search_filter:    'applyAdFilter',
  check_filter_syntax:     'applyAdFilter',
  try_upn_bind_format:     'applyUpnBind',
}

export function buildLdapTestSuggestions(
  diagnostic: LdapTestDiagnostic,
  dto: AdminAuthProvidersDto['ldap'],
): LdapTestSuggestion[] {
  const suggestions: LdapTestSuggestion[] = []
  const rootDn = domainRootDnFromDn(dto.baseDn ?? '') ?? domainRootDnFromUrl(dto.url ?? '')

  for (const hint of diagnostic.hints) {
    const actionType = HINT_ACTIONS[hint]
    if (actionType && !suggestions.some((s) => s.key === hint)) {
      const payload: Record<string, string> = {}
      if (actionType === 'applyRootBaseDn' && rootDn) payload.baseDn = rootDn
      if (actionType === 'applyUpnBind') {
        const upn = suggestUpnBindFromDn(dto.bindDn ?? '', rootDn)
        if (upn) payload.bindDn = upn
      }
      suggestions.push({
        key: hint,
        actionType: actionType === 'applyUpnBind' && !payload.bindDn ? undefined : actionType,
        ...(Object.keys(payload).length ? { payload } : {}),
      })
    }
  }

  if (
    rootDn
    && dto.baseDn?.trim().toLowerCase() !== rootDn.toLowerCase()
    && (diagnostic.safeCode === 'operations_error' || diagnostic.step === 'userSearch')
    && !suggestions.some((s) => s.actionType === 'testRootBaseDn')
  ) {
    suggestions.unshift({
      key:        'try_domain_root_base_dn',
      actionType: 'testRootBaseDn',
      payload:    { baseDn: rootDn },
    })
  }

  if (
    diagnostic.safeCode === 'operations_error'
    && !suggestions.some((s) => s.actionType === 'applyAdPreset')
  ) {
    suggestions.splice(1, 0, {
      key:        'verify_search_filter',
      actionType: 'applyAdPreset',
    })
  }

  const netbios = suggestNetbiosBindFromDn(dto.bindDn ?? '', rootDn)
  if (
    netbios
    && diagnostic.safeCode === 'operations_error'
    && !suggestions.some((s) => s.actionType === 'applyBindNetbios')
  ) {
    suggestions.push({
      key:        'verify_bind_format',
      actionType: 'applyBindNetbios',
      payload:    { bindDn: netbios },
    })
  }

  if (diagnostic.rootBaseDnProbe) {
    suggestions.unshift({
      key:        diagnostic.rootBaseDnProbe.ok ? 'root_base_dn_probe_ok' : 'root_base_dn_probe_failed',
      actionType: diagnostic.rootBaseDnProbe.ok ? 'applyRootBaseDn' : undefined,
      payload:    { baseDn: diagnostic.rootBaseDnProbe.baseDn },
    })
  }

  return suggestions
}

export function buildStructuredLdapTestResponse(
  result: LdapTestResult,
  dto: AdminAuthProvidersDto['ldap'],
  row?: SearchRowPreview | null,
): LdapStructuredTestResponse {
  const d = result.diagnostic
  const ok = result.ok
  const progress = mapProgress(d.stepResults ?? [])
  const category = ldapSafeCodeToCategory(d.safeCode)

  const structured: LdapStructuredTestResponse = {
    ok,
    failedStep: mapFailedStep(d.step, ok),
    progress,
    configTested: {
      url:                 d.config.serverUrl,
      tlsMode:             d.config.tlsMode,
      verifyTls:           d.config.verifyTls,
      bindPrincipalMasked: d.config.bindPrincipal,
      baseDn:              d.config.baseDn,
      renderedFilter:      d.renderedFilter ?? (d.config.userFilter.includes('{{username}}') ? undefined : d.config.userFilter),
      loginAttr:           d.config.loginAttribute,
      displayAttr:         d.config.loginAttribute,
      groupAttr:           d.config.groupAttribute,
      timeout:             d.config.timeoutSec,
      ...(d.config.lookupUsername ? { lookupUser: d.config.lookupUsername } : {}),
    },
    suggestions: buildLdapTestSuggestions(d, dto),
    commands:    d.commandExamples,
    diagnostic:  d,
  }

  if (!ok) {
    structured.error = {
      category,
      ldapName:           d.ldapErrorName,
      ldapCode:           d.ldapErrorCode,
      message:            d.safeMessage,
      diagnosticMessage:  d.diagnosticMessage,
      matchedDN:          d.matchedDN,
      referrals:          d.referrals,
    }
    structured.errorMessage = d.safeMessage
  }

  if (d.rootBaseDnProbe) {
    structured.rootBaseDnProbe = d.rootBaseDnProbe
  }

  if (result.ok) {
    structured.bindOk = result.bindOk
    structured.searchSampleCount = result.searchSampleCount
    if (result.connectOnly) structured.connectOnly = true
    if (result.bindOnly) structured.bindOnly = true
    if (result.userLookup !== undefined) structured.userLookup = result.userLookup
    if (result.groupReadOk !== undefined) structured.groupReadOk = result.groupReadOk

    if (row) {
      structured.result = {
        userFound:          true,
        dn:                 row.dn,
        attributesPreview:  row.attributesPreview,
        groupsCount:        row.groupDns.length,
      }
    } else if (result.userLookup === false) {
      structured.result = { userFound: false }
    }
  }

  structured.configTested.displayAttr = dto.displayNameAttribute?.trim() || d.config.loginAttribute
  return structured
}
