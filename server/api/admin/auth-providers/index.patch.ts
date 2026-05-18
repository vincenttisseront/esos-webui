import { createError } from 'h3'
import { applyAuthProvidersPatch, type AuthProvidersPatchBody } from '../../../utils/auth-providers-config'
import { clearOidcDiscoveryCache } from '../../../utils/oidc-discovery'

export default defineEventHandler(async (event) => {
  const body = await readBody<AuthProvidersPatchBody>(event)
  const updated = await applyAuthProvidersPatch(body ?? {})
  if (updated.some((k) => k.startsWith('oidc.'))) {
    clearOidcDiscoveryCache()
  }
  if (updated.length === 0) {
    throw createError({ statusCode: 400, message: 'Aucun champ valide fourni' })
  }
  return { ok: true, updated }
})
