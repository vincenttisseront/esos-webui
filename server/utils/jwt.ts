import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import type { UserRole } from './types'

/**
 * JWT de session (cf. SDD v2.1 §6 / v3.7). HS256, 8h d'expiration.
 */

export interface SessionPayload extends JWTPayload {
  userId:         string
  username:       string
  role:           UserRole
  sessionVersion: number
}

const JWT_EXPIRY = '8h'
const COOKIE_NAME = 'esos_session'

function getSecret(): Uint8Array {
  const key = process.env.NUXT_JWT_SECRET
  if (!key || key.length < 32) {
    throw new Error(
      'NUXT_JWT_SECRET manquant ou trop court (min 32 caractères). ' +
        'Générer : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
  return new TextEncoder().encode(key)
}

export async function signSession(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify<SessionPayload>(token, getSecret())
  return payload
}

// NUXT_COOKIE_SECURE=false disables the Secure flag for HTTP-only deployments
// (e.g. nginx without TLS). Defaults to true in production.
const cookieSecure = process.env.NUXT_COOKIE_SECURE !== 'false'
  && process.env.NODE_ENV === 'production'

export const SESSION_COOKIE = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 8 * 60 * 60,
  },
}
