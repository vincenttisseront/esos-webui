/**
 * Short-lived signed tickets for /ws/terminal (stateless — works behind load balancers).
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const PURPOSE = 'ws_terminal'
const TTL     = '30s'

interface WsTerminalTicketPayload extends JWTPayload {
  sanId:   string
  purpose: typeof PURPOSE
}

function getSecret(): Uint8Array {
  const key = process.env.NUXT_JWT_SECRET
  if (!key || key.length < 32) {
    throw new Error('NUXT_JWT_SECRET manquant ou trop court pour les tickets terminal WS')
  }
  return new TextEncoder().encode(key)
}

export async function issueWsTerminalTicket(userId: string, sanId: string): Promise<string> {
  return new SignJWT({ sanId, purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(getSecret())
}

export type WsTerminalTicketVerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'expired' | 'san_mismatch' | 'purpose' }

export async function verifyWsTerminalTicket(
  ticket: string | null | undefined,
  sanId: string,
): Promise<WsTerminalTicketVerifyResult> {
  const t = (ticket ?? '').trim()
  if (!t) return { ok: false, reason: 'missing' }

  try {
    const { payload } = await jwtVerify<WsTerminalTicketPayload>(t, getSecret())
    if (payload.purpose !== PURPOSE) return { ok: false, reason: 'purpose' }
    const sub = payload.sub
    if (!sub) return { ok: false, reason: 'invalid' }
    if ((payload.sanId ?? '').trim() !== sanId.trim()) return { ok: false, reason: 'san_mismatch' }
    return { ok: true, userId: sub }
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (/expired|exp/i.test(msg)) return { ok: false, reason: 'expired' }
    return { ok: false, reason: 'invalid' }
  }
}

/** @deprecated no-op — tickets are stateless JWTs */
export function clearWsTerminalTickets(): void { /* noop */ }
