import type { H3Event } from 'h3'
import { createError, getRequestHeader } from 'h3'

/**
 * Builds public origin for OIDC redirect_uri (reverse-proxy aware).
 * Production + secure cookies: requires https.
 */
export function getTrustedPublicOrigin(event: H3Event): string {
  const xfProto = getRequestHeader(event, 'x-forwarded-proto')?.split(',')[0]?.trim()
  const xfHost  = getRequestHeader(event, 'x-forwarded-host')?.split(',')[0]?.trim()
  const host    = xfHost || getRequestHeader(event, 'host') || ''

  let proto = xfProto || getRequestURL(event).protocol.replace(':', '')
  if (!proto) proto = 'http'

  const secureCookie =
    process.env.NUXT_COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production'

  if (secureCookie && proto !== 'https') {
    throw createError({
      statusCode: 503,
      message:
        'HTTPS requis pour la redirection OIDC en production (X-Forwarded-Proto / TLS).',
    })
  }

  if (!host) {
    throw createError({ statusCode: 400, message: 'En-tête Host manquant pour OIDC.' })
  }

  return `${proto}://${host}`
}

export function buildOidcRedirectUri(event: H3Event, redirectPath: string): string {
  const origin = getTrustedPublicOrigin(event)
  const path   = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`
  return `${origin}${path}`
}
