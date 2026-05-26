import { buildAdminAuthProvidersDto } from '../../../../utils/auth-providers-config'
import { assertSafeLdapLoginUsername } from '../../../../utils/ldap-filter-escape'
import { domainRootDnFromDn, domainRootDnFromUrl } from '../../../../utils/ldap-ad-defaults'
import { testLdapSettings, type LdapTestAction } from '../../../../utils/ldap-service'
import { buildStructuredLdapTestResponse } from '../../../../utils/ldap-test-response'
import { recordLdapAuthEventFromTest } from '../../../../utils/ldap-auth-events'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    bindPassword?: string
    username?:    string
    action?:      LdapTestAction
    baseDnOverride?: string
  }>(event).catch(() => ({}))

  const action: LdapTestAction | undefined = body.action
  if (body.username?.trim()) {
    assertSafeLdapLoginUsername(body.username.trim())
  }
  if ((action === 'search' || action === 'group' || action === 'searchRoot') && !body.username?.trim()) {
    throw createError({
      statusCode: 400,
      message:    'Username required for user search test',
    })
  }

  const dto = await buildAdminAuthProvidersDto()
  let baseDnOverride = body.baseDnOverride?.trim()
  if (action === 'searchRoot' && !baseDnOverride) {
    baseDnOverride = domainRootDnFromDn(dto.ldap.baseDn ?? '')
      ?? domainRootDnFromUrl(dto.ldap.url ?? '')
      ?? undefined
  }

  const startedAt = Date.now()
  const testAction = action ?? (body.username?.trim() ? 'search' : 'bind')
  const result = await testLdapSettings(dto.ldap, {
    bindPasswordOverride: body.bindPassword,
    username:             body.username,
    action,
    baseDnOverride,
    probeRootBaseDn:      action !== 'connect' && action !== 'bind',
  })

  recordLdapAuthEventFromTest({
    action:      testAction,
    diagnostic:  result.diagnostic,
    dto:         dto.ldap,
    lookupUser:  body.username?.trim(),
    httpOk:      result.ok,
    durationMs:  Date.now() - startedAt,
    requestIp:   getRequestIP(event) ?? undefined,
    userAgent:   getRequestHeader(event, 'user-agent') ?? undefined,
  })

  const row = result.ok ? result.diagnostic.searchResultPreview ?? null : null
  return buildStructuredLdapTestResponse(result, dto.ldap, row)
})
