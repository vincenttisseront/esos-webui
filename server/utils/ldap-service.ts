import { createError } from 'h3'
import ldap from 'ldapjs'
import type { AdminAuthProvidersDto } from './auth-providers-config'
import { escapeLdapFilterValue } from './ldap-filter-escape'
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
  markStepOk,
  type LdapStepProgress,
  type LdapTestResult,
  type LdapTestStep,
} from './ldap-diagnostics'

export type LdapTestAction = 'connect' | 'bind' | 'search'

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

export interface SearchRow {
  dn:               string
  displayName:      string | null
  groupDns:         string[]
  groupAttrPresent: boolean
}

function searchUserEntries(
  client: ldap.Client,
  baseDn: string,
  filter: string,
  displayAttr: string,
  groupAttr: string,
  timeoutSec: number,
): Promise<SearchRow[]> {
  return new Promise((resolve, reject) => {
    const rows: SearchRow[] = []
    client.search(
      baseDn,
      {
        scope:     'sub',
        sizeLimit: 5,
        timeLimit: timeoutSec,
        filter,
        attributes: [displayAttr, groupAttr],
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
          for (const a of p.attributes ?? []) {
            if (a.type === displayAttr && a.values?.length) {
              displayName = String(a.values[0])
            }
            if (a.type === groupAttr) {
              groupAttrPresent = true
              if (Array.isArray(a.values)) {
                for (const g of a.values) groupDns.push(String(g))
              }
            }
          }
          rows.push({ dn, displayName, groupDns, groupAttrPresent })
        })
        res.on('error', reject)
        res.on('end', () => resolve(rows))
      },
    )
  })
}

/** Build LDAP filter for a real sign-in identifier (RFC 4515 escaped). */
export function buildUserSearchFilter(
  dto: AdminAuthProvidersDto['ldap'],
  lookupUser: string,
): string {
  const esc = escapeLdapFilterValue(lookupUser)
  return dto.userSearchFilter.includes('{{username}}')
    ? dto.userSearchFilter.split('{{username}}').join(esc)
    : `(&${dto.userSearchFilter}(${dto.usernameAttribute}=${esc}))`
}

function resolveTestAction(
  options?: { username?: string; action?: LdapTestAction },
): LdapTestAction {
  if (options?.action) return options.action
  return options?.username?.trim() ? 'search' : 'bind'
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

export async function testLdapSettings(
  dto: AdminAuthProvidersDto['ldap'],
  options?: { bindPasswordOverride?: string; username?: string; action?: LdapTestAction },
): Promise<LdapTestResult> {
  const action     = resolveTestAction(options)
  const lookupUser = options?.username?.trim()
  const config = buildLdapTestConfigSummary(
    dto,
    lookupUser
      ? { username: lookupUser, userFilter: buildUserSearchFilter(dto, lookupUser) }
      : {},
  )
  const includeBind   = action === 'bind' || action === 'search'
  const includeSearch = action === 'search'
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

  if (action === 'search' && !lookupUser) {
    const result = buildLdapValidationFailure('config', 'config_incomplete', dto, config, stepResults)
    logLdapTestSafe(action, dto, result.diagnostic)
    return result
  }

  if ((action === 'bind' || action === 'search') && !dto.baseDn?.trim()) {
    const result = buildLdapValidationFailure('config', 'config_incomplete', dto, config, stepResults)
    logLdapTestSafe(action, dto, result.diagnostic)
    return result
  }

  if ((action === 'bind' || action === 'search') && !dto.bindDn?.trim()) {
    const result = buildLdapValidationFailure('config', 'config_incomplete', dto, config, stepResults)
    logLdapTestSafe(action, dto, result.diagnostic)
    return result
  }

  const bindPasswordOverride = options?.bindPasswordOverride
  if ((action === 'bind' || action === 'search') && !bindPasswordOverride && !dto.bindPasswordSet) {
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

    if (action === 'bind') {
      await unbindAsync(client)
      const diagnostic = buildLdapBindOnlySuccessDiagnostic(dto, config, stepResults)
      logLdapTestSafe(action, dto, diagnostic)
      return {
        ok:                true,
        bindOk:            true,
        bindOnly:          true,
        searchSampleCount: 0,
        diagnostic,
      }
    }

    step = 'userSearch'
    const filter = buildUserSearchFilter(dto, lookupUser!)
    const rows = await searchUserEntries(
      client,
      dto.baseDn,
      filter,
      dto.displayNameAttribute,
      dto.groupAttribute,
      dto.timeoutSec,
    )
    markStepOk(stepResults, 'userSearch')

    step = 'groupRead'
    const groupReadOk = rows.length === 0 || rows.some((r) => r.groupAttrPresent)
    markStepOk(stepResults, 'groupRead')

    await unbindAsync(client)

    if (rows.length === 0) {
      const diagnostic = buildLdapUserNotFoundDiagnostic(dto, config, stepResults, filter)
      logLdapTestSafe(action, dto, diagnostic)
      return {
        ok:                true,
        bindOk:            true,
        userLookup:        false,
        groupReadOk:       false,
        searchSampleCount: 0,
        diagnostic,
      }
    }

    const diagnostic = buildLdapSearchSuccessDiagnostic(dto, config, rows.length, stepResults, filter)
    logLdapTestSafe(action, dto, diagnostic)
    return {
      ok:                true,
      bindOk:            true,
      userLookup:        true,
      groupReadOk,
      searchSampleCount: rows.length,
      diagnostic,
    }
  } catch (e) {
    try {
      await unbindAsync(client)
    } catch { /* ignore */ }
    const diagnostic = buildLdapFailureDiagnostic(e, step, dto, config, stepResults)
    logLdapTestSafe(action, dto, diagnostic)
    return {
      ok:         false,
      diagnostic,
    }
  }
}

export async function authenticateLdapUser(
  dto: AdminAuthProvidersDto['ldap'],
  bindPassword: string | null,
  username: string,
  password: string,
): Promise<SearchRow> {
  assertLdapTlsPolicyForProduction(dto.url, dto.startTls)
  if (!dto.enabled) {
    throw createError({ statusCode: 403, message: 'LDAP désactivé' })
  }
  if (!dto.url || !dto.baseDn || !dto.bindDn || !bindPassword) {
    throw createError({ statusCode: 503, message: 'LDAP non configuré' })
  }
  const filter = buildUserSearchFilter(dto, username)

  const client = createLdapClient(dto.url, dto.timeoutSec, dto.tlsVerify)
  try {
    if (dto.url.startsWith('ldap:') && dto.startTls) {
      await startTlsAsync(client, dto.tlsVerify)
    }
    await bindAsync(client, dto.bindDn, bindPassword)
    const rows = await searchUserEntries(
      client,
      dto.baseDn,
      filter,
      dto.displayNameAttribute,
      dto.groupAttribute,
      dto.timeoutSec,
    )
    if (rows.length === 0) {
      await unbindAsync(client)
      throw createError({ statusCode: 401, message: 'Identifiants incorrects' })
    }
    const row = rows[0]!
    await bindAsync(client, row.dn, password)
    await unbindAsync(client)
    return row
  } catch (e) {
    try {
      await unbindAsync(client)
    } catch { /* ignore */ }
    if ((e as { statusCode?: number }).statusCode) throw e
    throw createError({ statusCode: 401, message: 'Identifiants incorrects' })
  }
}
