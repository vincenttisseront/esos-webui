import { createError } from 'h3'
import ldap from 'ldapjs'
import type { AdminAuthProvidersDto } from './auth-providers-config'
import { domainRootDnFromDn, domainRootDnFromUrl } from './ldap-ad-defaults'
import {
  buildLdapUserSearchFilter,
  ldapLoginIdentityDiagnosticMessage,
  normalizeLdapLoginIdentifier,
  resolveLdapLoginIdentity,
} from './ldap-username-normalize'
import {
  buildInitialStepResults,
  buildLdapBindOnlySuccessDiagnostic,
  buildLdapConnectSuccessDiagnostic,
  buildLdapFailureDiagnostic,
  buildLdapSearchSuccessDiagnostic,
  buildLdapTestConfigSummary,
  buildLdapUserNotFoundDiagnostic,
  buildLdapValidationFailure,
  ldapTlsStepNeeded,
  logLdapTestSafe,
  markStepFailed,
  markStepOk,
  type LdapRootBaseDnProbe,
  type LdapStepProgress,
  type LdapTestDiagnostic,
  type LdapTestResult,
  type LdapTestStep,
  type SearchRowPreview,
} from './ldap-diagnostics'

export type LdapTestAction = 'connect' | 'bind' | 'search' | 'group' | 'full' | 'searchRoot'

const LDAP_SEARCH_SIZE_LIMIT = 5

export function assertLdapTlsPolicyForProduction(urlStr: string, startTls: boolean): void {
  const isProd = process.env.NODE_ENV === 'production'
  if (!isProd) return
  const normalized = urlStr.includes('://') ? urlStr : `ldap://${urlStr}`
  let u: URL
  try {
    u = new URL(normalized)
  } catch {
    throw createError({ statusCode: 400, message: 'URL LDAP invalide' })
  }
  if (u.protocol === 'ldaps:') return
  if (u.protocol === 'ldap:') {
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return
    if (!startTls) {
      throw createError({
        statusCode: 400,
        message:
          'Production : utilisez LDAPS ou ldap:// avec StartTLS (sauf localhost).',
      })
    }
  }
}

function tlsOptions(tlsVerify: boolean): { rejectUnauthorized: boolean } {
  return { rejectUnauthorized: tlsVerify }
}

function createLdapClient(urlStr: string, timeoutSec: number, tlsVerify: boolean): ldap.Client {
  return ldap.createClient({
    url:            urlStr,
    timeout:        timeoutSec * 1000,
    connectTimeout: timeoutSec * 1000,
    reconnect:      false,
    tlsOptions:     tlsOptions(tlsVerify),
  })
}

function bindAsync(client: ldap.Client, dn: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.bind(dn, password, (err) => (err ? reject(err) : resolve()))
  })
}

function unbindAsync(client: ldap.Client): Promise<void> {
  return new Promise((resolve) => {
    try {
      client.unbind(() => resolve())
    } catch {
      resolve()
    }
  })
}

function startTlsAsync(client: ldap.Client, tlsVerify: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    client.starttls(tlsOptions(tlsVerify), undefined, (err) => (err ? reject(err) : resolve()))
  })
}

/** Trigger TCP connect; for LDAPS this also completes the TLS handshake. Referrals are not followed. */
function probeConnectionAsync(client: ldap.Client, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)
    client.search(
      '',
      {
        scope:     'base',
        filter:    '(objectClass=*)',
        sizeLimit: 1,
        timeLimit: Math.max(1, Math.ceil(timeoutMs / 1000)),
      },
      (err, res) => {
        clearTimeout(timer)
        if (err) {
          const code = (err as { lde_errno?: number }).lde_errno
          if (code !== undefined && code !== 0) {
            resolve()
            return
          }
          reject(err)
          return
        }
        res.on('error', reject)
        res.on('end', () => resolve())
      },
    )
  })
}

export interface SearchRow extends SearchRowPreview {}

function sanitizeAttrValue(value: string): string {
  const v = value.trim()
  return v.length > 120 ? `${v.slice(0, 117)}…` : v
}

function buildSearchAttributes(dto: AdminAuthProvidersDto['ldap']): string[] {
  const attrs = new Set<string>([
    dto.usernameAttribute?.trim() || 'sAMAccountName',
    dto.displayNameAttribute?.trim() || 'displayName',
    dto.groupAttribute?.trim() || 'memberOf',
    'distinguishedName',
    'mail',
  ])
  return [...attrs].filter(Boolean)
}

function searchUserEntries(
  client: ldap.Client,
  baseDn: string,
  filter: string,
  dto: AdminAuthProvidersDto['ldap'],
  timeoutSec: number,
  sizeLimit = LDAP_SEARCH_SIZE_LIMIT,
): Promise<SearchRow[]> {
  const displayAttr = dto.displayNameAttribute?.trim() || 'displayName'
  const groupAttr   = dto.groupAttribute?.trim() || 'memberOf'
  const loginAttr   = dto.usernameAttribute?.trim() || 'sAMAccountName'
  const attributes  = buildSearchAttributes(dto)

  return new Promise((resolve, reject) => {
    const rows: SearchRow[] = []
    client.search(
      baseDn,
      {
        scope:     'sub',
        sizeLimit,
        timeLimit: timeoutSec,
        filter,
        attributes,
      },
      (err, res) => {
        if (err) {
          reject(err)
          return
        }
        res.on('searchEntry', (entry) => {
          const p = (entry as { _pojo?: () => {
            objectName: string
            attributes: Array<{ type: string; values?: string[] }>
          } })._pojo?.()
          if (!p) return
          const dn = p.objectName
          let displayName: string | null = null
          let groupAttrPresent = false
          const groupDns: string[] = []
          const attributesPreview: Record<string, string | string[]> = {}
          let loginValue: string | null = null
          let mailValue: string | null = null

          for (const a of p.attributes ?? []) {
            const vals = (a.values ?? []).map((v) => sanitizeAttrValue(String(v)))
            if (vals.length === 1) attributesPreview[a.type] = vals[0]!
            else if (vals.length > 1) attributesPreview[a.type] = vals

            if (a.type === displayAttr && a.values?.length) {
              displayName = sanitizeAttrValue(String(a.values[0]))
            }
            if (a.type === loginAttr && a.values?.length) {
              loginValue = sanitizeAttrValue(String(a.values[0]))
              attributesPreview[loginAttr] = loginValue
            }
            if (a.type === 'mail' && a.values?.length) {
              mailValue = sanitizeAttrValue(String(a.values[0]))
            }
            if (a.type === groupAttr) {
              groupAttrPresent = true
              if (Array.isArray(a.values)) {
                for (const g of a.values) groupDns.push(String(g))
              }
            }
          }
          attributesPreview.distinguishedName = dn
          if (loginValue) attributesPreview[loginAttr] = loginValue
          if (mailValue) attributesPreview.mail = mailValue
          rows.push({ dn, displayName, groupDns, groupAttrPresent, attributesPreview })
        })
        res.on('error', reject)
        res.on('end', () => resolve(rows))
      },
    )
  })
}

/** Build LDAP filter for sign-in / exact user lookup (RFC 4515 escaped, normalized). */
export function buildUserSearchFilter(
  dto: AdminAuthProvidersDto['ldap'],
  lookupUser: string,
): string {
  return buildLdapUserSearchFilter(dto, lookupUser)
}

export {
  buildLdapUserSearchFilter,
  normalizeLdapLoginIdentifier,
  normalizeLdapLoginUsername,
  renderLdapUserFilter,
  resolveLdapLoginIdentity,
  type NormalizedLdapLogin,
  type NormalizedLdapLoginIdentity,
} from './ldap-username-normalize'

/** Options for diagnostics / config summary when testing or logging a user lookup. */
export function ldapLoginLookupSummaryOptions(
  dto: AdminAuthProvidersDto['ldap'],
  lookupUser: string,
) {
  const identity = resolveLdapLoginIdentity(lookupUser, dto)
  return {
    username:            lookupUser.trim(),
    userFilter:          buildLdapUserSearchFilter(dto, lookupUser),
    rawUsername:         identity.rawUsername,
    accountName:         identity.accountName,
    userPrincipalName:   identity.userPrincipalName,
  }
}

function resolveDomainRootBaseDn(dto: AdminAuthProvidersDto['ldap']): string | null {
  return domainRootDnFromDn(dto.baseDn ?? '') ?? domainRootDnFromUrl(dto.url ?? '')
}

function resolveTestAction(
  options?: { username?: string; action?: LdapTestAction },
): LdapTestAction {
  if (options?.action) return options.action
  return options?.username?.trim() ? 'search' : 'bind'
}

function actionIncludesSearch(action: LdapTestAction): boolean {
  return action === 'search' || action === 'group' || action === 'full' || action === 'searchRoot'
}

function actionRequiresUsername(action: LdapTestAction): boolean {
  return action === 'search' || action === 'group' || action === 'searchRoot'
}

async function runTlsSteps(
  client: ldap.Client,
  dto: AdminAuthProvidersDto['ldap'],
  stepResults: LdapStepProgress[],
): Promise<LdapTestStep> {
  let step: LdapTestStep = 'connection'
  await probeConnectionAsync(client, dto.timeoutSec * 1000)
  markStepOk(stepResults, 'connection')

  if (dto.url.startsWith('ldap:') && dto.startTls) {
    step = 'starttls'
    await startTlsAsync(client, dto.tlsVerify)
    markStepOk(stepResults, 'starttls')
  } else if (ldapTlsStepNeeded(dto.url, dto.startTls)) {
    markStepOk(stepResults, 'starttls')
  }
  return step
}

async function probeRootBaseDnSearch(
  client: ldap.Client,
  dto: AdminAuthProvidersDto['ldap'],
  lookupUser: string,
  configuredBaseDn: string,
  timeoutSec: number,
): Promise<LdapRootBaseDnProbe | undefined> {
  const rootDn = resolveDomainRootBaseDn(dto)
  if (!rootDn || rootDn.toLowerCase() === configuredBaseDn.trim().toLowerCase()) return undefined
  const filter = buildUserSearchFilter(dto, lookupUser)
  try {
    const rows = await searchUserEntries(client, rootDn, filter, dto, timeoutSec)
    return {
      baseDn:    rootDn,
      ok:        true,
      userFound: rows.length > 0,
      message:   rows.length > 0
        ? 'User search succeeded with domain root base DN.'
        : 'Domain root base DN accepted the search but returned no user.',
    }
  } catch (e) {
    const msg = (e as { lde_message?: string; message?: string }).lde_message
      ?? (e as { message?: string }).message
      ?? 'Search failed with domain root base DN.'
    return {
      baseDn:  rootDn,
      ok:      false,
      message: String(msg).slice(0, 240),
    }
  }
}

function attachSearchPreview(diagnostic: LdapTestDiagnostic, row: SearchRow | undefined): void {
  if (row) diagnostic.searchResultPreview = row
}

export async function testLdapSettings(
  dto: AdminAuthProvidersDto['ldap'],
  options?: {
    bindPasswordOverride?: string
    username?:            string
    action?:              LdapTestAction
    baseDnOverride?:      string
    probeRootBaseDn?:     boolean
  },
): Promise<LdapTestResult> {
  const action     = resolveTestAction(options)
  const lookupUser = options?.username?.trim()
  const searchBaseDn = options?.baseDnOverride?.trim() || dto.baseDn?.trim() || ''
  const config = buildLdapTestConfigSummary(
    {
      ...dto,
      baseDn: searchBaseDn || dto.baseDn,
    },
    lookupUser ? ldapLoginLookupSummaryOptions(dto, lookupUser) : {},
  )
  const includeBind   = action !== 'connect'
  const includeSearch = actionIncludesSearch(action)
  const stepResults   = buildInitialStepResults(dto.url ?? '', dto.startTls, includeBind, includeSearch)

  try {
    assertLdapTlsPolicyForProduction(dto.url, dto.startTls)
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode) throw e
    const result = buildLdapValidationFailure('config', 'tls_policy_rejected', dto, config, stepResults)
    logLdapTestSafe(action, dto, result.diagnostic)
    return result
  }

  if (!dto.url?.trim()) {
    const result = buildLdapValidationFailure('config', 'config_incomplete', dto, config, stepResults)
    logLdapTestSafe(action, dto, result.diagnostic)
    return result
  }

  if (actionRequiresUsername(action) && !lookupUser) {
    const result = buildLdapValidationFailure('config', 'config_incomplete', dto, config, stepResults)
    logLdapTestSafe(action, dto, result.diagnostic)
    return result
  }

  if (includeBind && !searchBaseDn) {
    const result = buildLdapValidationFailure('config', 'config_incomplete', dto, config, stepResults)
    logLdapTestSafe(action, dto, result.diagnostic)
    return result
  }

  if (includeBind && !dto.bindDn?.trim()) {
    const result = buildLdapValidationFailure('config', 'config_incomplete', dto, config, stepResults)
    logLdapTestSafe(action, dto, result.diagnostic)
    return result
  }

  const bindPasswordOverride = options?.bindPasswordOverride
  if (includeBind && !bindPasswordOverride && !dto.bindPasswordSet) {
    const result = buildLdapValidationFailure('bind', 'bind_password_missing', dto, config, stepResults)
    logLdapTestSafe(action, dto, result.diagnostic)
    return result
  }

  if (dto.timeoutSec <= 0) {
    const result = buildLdapValidationFailure('config', 'config_incomplete', dto, config, stepResults)
    logLdapTestSafe(action, dto, result.diagnostic)
    return result
  }

  const pwd    = bindPasswordOverride ?? ''
  let step: LdapTestStep = 'connection'
  const client = createLdapClient(dto.url, dto.timeoutSec, dto.tlsVerify)

  try {
    step = await runTlsSteps(client, dto, stepResults)

    if (action === 'connect') {
      await unbindAsync(client)
      const diagnostic = buildLdapConnectSuccessDiagnostic(dto, config, stepResults)
      logLdapTestSafe(action, dto, diagnostic)
      return {
        ok:                true,
        bindOk:            false,
        connectOnly:       true,
        searchSampleCount: 0,
        diagnostic,
      }
    }

    step = 'bind'
    await bindAsync(client, dto.bindDn, pwd)
    markStepOk(stepResults, 'bind')

    if (action === 'bind' || (action === 'full' && !lookupUser)) {
      await unbindAsync(client)
      const diagnostic = buildLdapBindOnlySuccessDiagnostic(dto, config, stepResults)
      logLdapTestSafe(action, dto, diagnostic)
      return {
        ok:                true,
        bindOk:            true,
        bindOnly:          action === 'bind',
        fullTest:          action === 'full',
        searchSampleCount: 0,
        diagnostic,
      }
    }

    step = 'userSearch'
    const filter = buildUserSearchFilter(dto, lookupUser!)
    let rows: SearchRow[]
    try {
      rows = await searchUserEntries(client, searchBaseDn, filter, dto, dto.timeoutSec)
    } catch (searchErr) {
      const shouldProbe = options?.probeRootBaseDn !== false
        && (action === 'search' || action === 'searchRoot' || action === 'full')
      if (shouldProbe) {
        const probe = await probeRootBaseDnSearch(
          client,
          dto,
          lookupUser!,
          searchBaseDn,
          dto.timeoutSec,
        )
        if (probe) {
          const diagnostic = buildLdapFailureDiagnostic(searchErr, step, dto, config, stepResults)
          diagnostic.rootBaseDnProbe = probe
          if (!probe.ok) {
            diagnostic.hints = [...new Set([...diagnostic.hints, 'try_domain_root_base_dn'])]
          }
          await unbindAsync(client)
          logLdapTestSafe(action, dto, diagnostic)
          return { ok: false, diagnostic }
        }
      }
      throw searchErr
    }
    markStepOk(stepResults, 'userSearch')

    step = 'groupRead'
    const groupReadOk = rows.length === 0 || rows.some((r) => r.groupAttrPresent)
    if (groupReadOk) markStepOk(stepResults, 'groupRead')
    else markStepFailed(stepResults, 'groupRead')

    await unbindAsync(client)

    if (rows.length === 0) {
      let probe: LdapRootBaseDnProbe | undefined
      if (action === 'search' || action === 'searchRoot' || action === 'full') {
        const probeClient = createLdapClient(dto.url, dto.timeoutSec, dto.tlsVerify)
        try {
          await runTlsSteps(probeClient, dto, buildInitialStepResults(dto.url, dto.startTls, true, false))
          await bindAsync(probeClient, dto.bindDn, pwd)
          probe = await probeRootBaseDnSearch(probeClient, dto, lookupUser!, searchBaseDn, dto.timeoutSec)
        } catch { /* ignore */ }
        finally {
          await unbindAsync(probeClient)
        }
      }
      const diagnostic = buildLdapUserNotFoundDiagnostic(dto, config, stepResults, filter)
      if (probe) diagnostic.rootBaseDnProbe = probe
      logLdapTestSafe(action, dto, diagnostic)
      return {
        ok:                true,
        bindOk:            true,
        userLookup:        false,
        groupReadOk:       false,
        searchSampleCount: 0,
        searchRootTest:    action === 'searchRoot',
        fullTest:          action === 'full',
        groupOnly:         action === 'group',
        diagnostic,
      }
    }

    const diagnostic = buildLdapSearchSuccessDiagnostic(dto, config, rows.length, stepResults, filter)
    attachSearchPreview(diagnostic, rows[0])
    if (action === 'group') diagnostic.step = 'groupRead'
    logLdapTestSafe(action, dto, diagnostic)
    return {
      ok:                true,
      bindOk:            true,
      userLookup:        true,
      groupReadOk,
      searchSampleCount: rows.length,
      searchRootTest:    action === 'searchRoot',
      fullTest:          action === 'full',
      groupOnly:         action === 'group',
      diagnostic,
    }
  } catch (e) {
    try {
      await unbindAsync(client)
    } catch { /* ignore */ }
    const diagnostic = buildLdapFailureDiagnostic(e, step, dto, config, stepResults)
    if (
      lookupUser
      && step === 'userSearch'
      && options?.probeRootBaseDn !== false
      && (action === 'search' || action === 'searchRoot' || action === 'full')
    ) {
      try {
        const probeClient = createLdapClient(dto.url, dto.timeoutSec, dto.tlsVerify)
        await runTlsSteps(probeClient, dto, buildInitialStepResults(dto.url, dto.startTls, true, false))
        await bindAsync(probeClient, dto.bindDn, pwd)
        const probe = await probeRootBaseDnSearch(probeClient, dto, lookupUser, searchBaseDn, dto.timeoutSec)
        if (probe) diagnostic.rootBaseDnProbe = probe
        await unbindAsync(probeClient)
      } catch { /* ignore probe errors */ }
    }
    logLdapTestSafe(action, dto, diagnostic)
    return {
      ok:         false,
      diagnostic,
    }
  }
}

const LDAP_DIRECTORY_MAX_LIMIT = 50

/** Service bind + directory search (admin provisioning). */
export async function runLdapDirectorySearch(
  dto: AdminAuthProvidersDto['ldap'],
  bindPassword: string,
  filter: string,
  limit: number,
): Promise<SearchRow[]> {
  if (!dto.url?.trim() || !dto.baseDn?.trim() || !dto.bindDn?.trim()) {
    throw createError({ statusCode: 400, message: 'Configuration LDAP incomplète' })
  }
  const sizeLimit = Math.min(Math.max(1, limit), LDAP_DIRECTORY_MAX_LIMIT)
  const client = createLdapClient(dto.url, dto.timeoutSec, dto.tlsVerify)
  try {
    if (dto.url.startsWith('ldap:') && dto.startTls) {
      await startTlsAsync(client, dto.tlsVerify)
    } else {
      await probeConnectionAsync(client, dto.timeoutSec * 1000)
    }
    await bindAsync(client, dto.bindDn, bindPassword)
    const rows = await searchUserEntries(
      client,
      dto.baseDn,
      filter,
      dto,
      dto.timeoutSec,
      sizeLimit,
    )
    await unbindAsync(client)
    return rows
  } catch (e) {
    try {
      await unbindAsync(client)
    } catch { /* ignore */ }
    if ((e as { statusCode?: number }).statusCode) throw e
    throw createError({
      statusCode: 502,
      message:    (e as { message?: string }).message ?? 'Recherche annuaire LDAP échouée',
    })
  }
}

export type LdapLoginAuditContext = {
  requestIp?:  string
  userAgent?:  string
}

export async function authenticateLdapUser(
  dto: AdminAuthProvidersDto['ldap'],
  bindPassword: string | null,
  username: string,
  password: string,
  audit?: LdapLoginAuditContext,
): Promise<SearchRow> {
  const { recordLdapLoginEvent, recordLdapLoginFromLdapError } = await import('./ldap-auth-events')
  const startedAt = Date.now()

  assertLdapTlsPolicyForProduction(dto.url, dto.startTls)
  if (!dto.enabled) {
    throw createError({ statusCode: 403, message: 'LDAP désactivé' })
  }
  if (!dto.url || !dto.baseDn || !dto.bindDn || !bindPassword) {
    throw createError({ statusCode: 503, message: 'LDAP non configuré' })
  }
  const identity = resolveLdapLoginIdentity(username, dto)
  const filter   = buildLdapUserSearchFilter(dto, username)
  const identityLog = ldapLoginIdentityDiagnosticMessage(identity)

  const client = createLdapClient(dto.url, dto.timeoutSec, dto.tlsVerify)
  let step: 'bind' | 'userSearch' | 'userBind' = 'bind'
  try {
    if (dto.url.startsWith('ldap:') && dto.startTls) {
      await startTlsAsync(client, dto.tlsVerify)
    }
    await bindAsync(client, dto.bindDn, bindPassword)
    step = 'userSearch'
    const rows = await searchUserEntries(
      client,
      dto.baseDn,
      filter,
      dto,
      dto.timeoutSec,
    )
    if (rows.length === 0) {
      await unbindAsync(client)
      recordLdapLoginEvent({
        step:              'userSearch',
        result:            'failure',
        safeCode:          'user_not_found',
        username,
        dto,
        renderedFilter:    filter,
        diagnosticMessage: identityLog,
        durationMs:        Date.now() - startedAt,
        ...audit,
      })
      throw createError({ statusCode: 401, message: 'Identifiants incorrects' })
    }
    const row = rows[0]!
    step = 'userBind'
    await bindAsync(client, row.dn, password)
    await unbindAsync(client)
    recordLdapLoginEvent({
      step:              'userBind',
      result:            'success',
      safeCode:          'bind_ok',
      username,
      dto,
      renderedFilter:    filter,
      diagnosticMessage: identityLog,
      matchedDn:         row.dn,
      durationMs:        Date.now() - startedAt,
      ...audit,
    })
    return row
  } catch (e) {
    try {
      await unbindAsync(client)
    } catch { /* ignore */ }
    const sc = (e as { statusCode?: number }).statusCode
    if (sc === 401 && step === 'userBind') {
      recordLdapLoginEvent({
        step:              'userBind',
        result:            'failure',
        safeCode:          'password_bind_failed',
        username,
        dto,
        renderedFilter:    filter,
        diagnosticMessage: identityLog,
        matchedDn:         undefined,
        durationMs:        Date.now() - startedAt,
        ...audit,
      })
      throw e
    }
    if (sc) {
      if (sc === 401) {
        recordLdapLoginEvent({
          step:              step === 'userSearch' ? 'userSearch' : 'userBind',
          result:            'failure',
          safeCode:          'invalid_credentials',
          username,
          dto,
          renderedFilter:    filter,
          diagnosticMessage: identityLog,
          durationMs:        Date.now() - startedAt,
          ...audit,
        })
      }
      throw e
    }
    recordLdapLoginFromLdapError({
      err:        e,
      step:       step === 'bind' ? 'bind' : 'userSearch',
      username,
      dto,
      filter,
      durationMs: Date.now() - startedAt,
      requestIp:  audit?.requestIp,
      userAgent:  audit?.userAgent,
    })
    throw createError({ statusCode: 401, message: 'Identifiants incorrects' })
  }
}
