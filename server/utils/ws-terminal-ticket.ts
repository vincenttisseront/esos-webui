/**
 * One-time WebSocket tickets for /ws/terminal when Cookie is not forwarded (e.g. nginx /ws/ block).
 */
import { randomBytes } from 'node:crypto'

const TTL_MS = 30_000

type TicketEntry = {
  userId:  string
  sanId:   string
  expires: number
}

const tickets = new Map<string, TicketEntry>()

export function issueWsTerminalTicket(userId: string, sanId: string): string {
  const ticket = randomBytes(24).toString('hex')
  tickets.set(ticket, {
    userId,
    sanId,
    expires: Date.now() + TTL_MS,
  })
  return ticket
}

export function consumeWsTerminalTicket(
  ticket: string | null | undefined,
  sanId: string,
): { ok: true; userId: string } | { ok: false } {
  const t = (ticket ?? '').trim()
  if (!t) return { ok: false }
  const entry = tickets.get(t)
  if (!entry) return { ok: false }
  tickets.delete(t)
  if (entry.expires < Date.now()) return { ok: false }
  if (entry.sanId !== sanId) return { ok: false }
  return { ok: true, userId: entry.userId }
}

/** Test helper */
export function clearWsTerminalTickets(): void {
  tickets.clear()
}
