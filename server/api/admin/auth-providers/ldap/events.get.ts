import {
  listLdapAuthEvents,
  LDAP_AUTH_EVENT_MAX_ROWS,
  LDAP_AUTH_EVENT_RETENTION_DAYS,
} from '../../../../db/repositories/ldap-auth-event.repository'
import type { LdapAuthEventType, LdapAuthEventResult } from '../../../../utils/ldap-auth-events'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)

  const eventType = (q.type as string | undefined)?.trim() as LdapAuthEventType | 'all' | undefined
  const result    = (q.result as string | undefined)?.trim() as LdapAuthEventResult | 'all' | undefined
  const limitRaw  = parseInt(String(q.limit ?? '50'), 10)
  const limit     = Number.isFinite(limitRaw) ? limitRaw : 50

  const events = await listLdapAuthEvents({
    eventType: eventType === 'test' || eventType === 'login' || eventType === 'provisioning'
      ? eventType
      : 'all',
    result: result === 'success' || result === 'failure' || result === 'skipped'
      ? result
      : 'all',
    limit,
  })

  return {
    events,
    retention: {
      maxRows: LDAP_AUTH_EVENT_MAX_ROWS,
      days:    LDAP_AUTH_EVENT_RETENTION_DAYS,
    },
  }
})
