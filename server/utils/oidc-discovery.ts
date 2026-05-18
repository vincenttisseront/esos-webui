import { createError } from 'h3'
import * as oidc from 'openid-client'

const cache = new Map<string, { cfg: oidc.Configuration; exp: number }>()
const TTL_MS = 5 * 60 * 1000

function cacheKey(issuer: string, clientId: string, hasSecret: boolean): string {
  return `${issuer}\n${clientId}\n${hasSecret ? '1' : '0'}`
}

export async function getOidcConfigurationCached(
  issuer: string,
  clientId: string,
  clientSecret: string | null,
  redirectUri?: string,
): Promise<oidc.Configuration> {
  const i = issuer.trim().replace(/\/+$/, '')
  const key = cacheKey(i, clientId, !!clientSecret) + (redirectUri ? `\n${redirectUri}` : '')
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.exp > now) return hit.cfg

  const issuerUrl = new URL(i.endsWith('/') ? i : `${i}/`)
  const auth = clientSecret ? oidc.ClientSecretPost(clientSecret) : oidc.None()
  const meta = redirectUri ? { redirect_uris: [redirectUri] } : undefined
  const cfg  = await oidc.discovery(issuerUrl, clientId, meta, auth)
  cache.set(key, { cfg, exp: now + TTL_MS })
  return cfg
}

export function clearOidcDiscoveryCache(): void {
  cache.clear()
}
