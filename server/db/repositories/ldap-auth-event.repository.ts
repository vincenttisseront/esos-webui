import { randomUUID } from 'node:crypto'
import { desc, eq, lt, sql, and, type SQL } from 'drizzle-orm'
import { getDB } from '../index'
import { ldapAuthEvents } from '../schema'
import type { LdapAuthEventRecord, LdapAuthEventType, LdapAuthEventResult } from '../../utils/ldap-auth-events'

export const LDAP_AUTH_EVENT_RETENTION_DAYS = 30
export const LDAP_AUTH_EVENT_MAX_ROWS       = 5000

export async function insertLdapAuthEvent(
  row: Omit<LdapAuthEventRecord, 'id' | 'at'> & { at?: string },
): Promise<string> {
  const db  = getDB()
  const id  = randomUUID()
  const at  = row.at ?? new Date().toISOString()
  db.insert(ldapAuthEvents).values({
    id,
    at,
    eventType:         row.eventType,
    action:            row.action,
    step:              row.step,
    result:            row.result,
    safeCode:          row.safeCode ?? null,
    username:          row.username ?? null,
    provider:          row.provider ?? 'ldap',
    urlHost:           row.urlHost ?? null,
    baseDn:            row.baseDn ?? null,
    renderedFilter:    row.renderedFilter ?? null,
    ldapErrorName:     row.ldapErrorName ?? null,
    ldapErrorCode:     row.ldapErrorCode != null ? String(row.ldapErrorCode) : null,
    diagnosticMessage: row.diagnosticMessage ?? null,
    matchedDn:         row.matchedDn ?? null,
    referralsJson:     row.referralsJson ?? null,
    durationMs:        row.durationMs ?? null,
    requestIp:         row.requestIp ?? null,
    userAgent:         row.userAgent ?? null,
    stepResultsJson:   row.stepResultsJson ?? null,
  }).run()
  await pruneLdapAuthEvents()
  return id
}

export async function pruneLdapAuthEvents(): Promise<void> {
  const db = getDB()
  const cutoff = new Date(Date.now() - LDAP_AUTH_EVENT_RETENTION_DAYS * 86_400_000).toISOString()
  db.delete(ldapAuthEvents).where(lt(ldapAuthEvents.at, cutoff)).run()

  const countRows = db
    .select({ count: sql<number>`count(*)` })
    .from(ldapAuthEvents)
    .all()
  const total = Number(countRows[0]?.count ?? 0)
  if (total <= LDAP_AUTH_EVENT_MAX_ROWS) return

  const excess = total - LDAP_AUTH_EVENT_MAX_ROWS
  const oldest = db
    .select({ id: ldapAuthEvents.id })
    .from(ldapAuthEvents)
    .orderBy(ldapAuthEvents.at)
    .limit(excess)
    .all()
  for (const row of oldest) {
    db.delete(ldapAuthEvents).where(eq(ldapAuthEvents.id, row.id)).run()
  }
}

export type ListLdapAuthEventsQuery = {
  eventType?: LdapAuthEventType | 'all'
  result?:    LdapAuthEventResult | 'all'
  limit?:     number
}

export async function listLdapAuthEvents(
  query: ListLdapAuthEventsQuery,
): Promise<LdapAuthEventRecord[]> {
  const db    = getDB()
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200)
  const conds: SQL[] = []

  if (query.eventType && query.eventType !== 'all') {
    conds.push(eq(ldapAuthEvents.eventType, query.eventType))
  }
  if (query.result && query.result !== 'all') {
    conds.push(eq(ldapAuthEvents.result, query.result))
  }

  const rows = db
    .select()
    .from(ldapAuthEvents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(ldapAuthEvents.at))
    .limit(limit)
    .all()

  return rows.map((r) => ({
    id:                r.id,
    at:                r.at,
    eventType:         r.eventType as LdapAuthEventType,
    action:            r.action,
    step:              r.step,
    result:            r.result as LdapAuthEventResult,
    safeCode:          r.safeCode ?? null,
    username:          r.username ?? null,
    provider:          r.provider,
    urlHost:           r.urlHost ?? null,
    baseDn:            r.baseDn ?? null,
    renderedFilter:    r.renderedFilter ?? null,
    ldapErrorName:     r.ldapErrorName ?? null,
    ldapErrorCode:     r.ldapErrorCode ?? null,
    diagnosticMessage: r.diagnosticMessage ?? null,
    matchedDn:         r.matchedDn ?? null,
    referralsJson:     r.referralsJson ?? null,
    durationMs:        r.durationMs ?? null,
    requestIp:         r.requestIp ?? null,
    userAgent:         r.userAgent ?? null,
    stepResultsJson:   r.stepResultsJson ?? null,
  }))
}
