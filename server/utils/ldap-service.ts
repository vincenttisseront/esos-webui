import { createError } from 'h3'
import ldap from 'ldapjs'
import type { AdminAuthProvidersDto } from './auth-providers-config'
import { escapeLdapFilterValue } from './ldap-filter-escape'
import {
  buildLdapFailureDiagnostic,
  buildLdapSuccessDiagnostic,
  buildLdapTestConfigSummary,
  buildLdapValidationFailure,
  type LdapTestResult,
  type LdapTestStep,
} from './ldap-diagnostics'

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
    url:               urlStr,
    timeout:           timeoutSec * 1000,
    connectTimeout:    timeoutSec * 1000,
    reconnect:         false,
    tlsOptions:        tlsOptions(tlsVerify),
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

export interface SearchRow {
  dn:          string
  displayName: string | null
  groupDns:    string[]
}

function searchUserEntries(
  client: ldap.Client,
  baseDn: string,
  filter: string,
  displayAttr: string,
  groupAttr: string,
): Promise<SearchRow[]> {
  return new Promise((resolve, reject) => {
    const rows: SearchRow[] = []
    client.search(
      baseDn,
      {
        scope:      'sub',
        sizeLimit:  5,
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
          const groupDns: string[] = []
          for (const a of p.attributes ?? []) {
            if (a.type === displayAttr && a.values?.length) {
              displayName = String(a.values[0])
            }
            if (a.type === groupAttr && Array.isArray(a.values)) {
              for (const g of a.values) groupDns.push(String(g))
            }
          }
          rows.push({ dn, displayName, groupDns })
        })
        res.on('error', reject)
        res.on('end', () => resolve(rows))
      },
    )
  })
}

function buildUserSearchFilter(
  dto: AdminAuthProvidersDto['ldap'],
  lookupUser?: string,
): string {
  if (lookupUser) {
    return dto.userSearchFilter.includes('{{username}}')
      ? dto.userSearchFilter.split('{{username}}').join(escapeLdapFilterValue(lookupUser))
      : `(&${dto.userSearchFilter}(${dto.usernameAttribute}=${escapeLdapFilterValue(lookupUser)}))`
  }
  return dto.userSearchFilter.includes('{{username}}')
    ? dto.userSearchFilter.split('{{username}}').join(escapeLdapFilterValue('__probe__'))
    : dto.userSearchFilter
}

export async function testLdapSettings(
  dto: AdminAuthProvidersDto['ldap'],
  options?: { bindPasswordOverride?: string; username?: string },
): Promise<LdapTestResult> {
  const lookupUser = options?.username?.trim()
  const filter     = buildUserSearchFilter(dto, lookupUser || undefined)
  const config     = buildLdapTestConfigSummary(dto, {
    username:   lookupUser || undefined,
    userFilter: filter,
  })

  try {
    assertLdapTlsPolicyForProduction(dto.url, dto.startTls)
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode) throw e
    return buildLdapValidationFailure('config', 'tls_policy_rejected', dto, config)
  }

  if (!dto.url?.trim() || !dto.baseDn?.trim() || !dto.bindDn?.trim()) {
    return buildLdapValidationFailure('config', 'config_incomplete', dto, config)
  }

  const bindPasswordOverride = options?.bindPasswordOverride
  if (!bindPasswordOverride && !dto.bindPasswordSet) {
    return buildLdapValidationFailure('bind', 'bind_password_missing', dto, config)
  }

  const pwd    = bindPasswordOverride ?? ''
  let step: LdapTestStep = 'connection'
  const client = createLdapClient(dto.url, dto.timeoutSec, dto.tlsVerify)

  try {
    if (dto.url.startsWith('ldap:') && dto.startTls) {
      step = 'starttls'
      await startTlsAsync(client, dto.tlsVerify)
    }

    step = 'bind'
    await bindAsync(client, dto.bindDn, pwd)

    step = 'userSearch'
    const rows = await searchUserEntries(
      client,
      dto.baseDn,
      filter,
      dto.displayNameAttribute,
      dto.groupAttribute,
    )

    step = 'groupRead'

    await unbindAsync(client)

    const userLookup = lookupUser ? rows.length > 0 : undefined
    const diagnostic = buildLdapSuccessDiagnostic(dto, config, rows.length, userLookup)

    return {
      ok:                true,
      bindOk:            true,
      searchSampleCount: rows.length,
      diagnostic,
      ...(userLookup !== undefined ? { userLookup } : {}),
    }
  } catch (e) {
    try {
      await unbindAsync(client)
    } catch { /* ignore */ }
    return {
      ok:         false,
      diagnostic: buildLdapFailureDiagnostic(e, step, dto, config),
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
  const esc   = escapeLdapFilterValue(username)
  const filter = dto.userSearchFilter.includes('{{username}}')
    ? dto.userSearchFilter.split('{{username}}').join(esc)
    : `(&${dto.userSearchFilter}(${dto.usernameAttribute}=${esc}))`

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
