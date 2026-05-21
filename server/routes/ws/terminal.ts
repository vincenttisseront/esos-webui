import type { IncomingMessage } from 'node:http'
import type { ClientChannel } from 'ssh2'
import type { SSHSessionManager } from '~/server/utils/ssh-session-manager'
import { getSSHPool } from '~/server/utils/ssh-pool'
import { SESSION_COOKIE } from '~/server/utils/jwt'
import {
  authenticateSessionFromToken,
  extractSessionTokenFromCookieHeader,
  isTerminalWebSocketRoleAllowed,
  readCookieHeaderFromIncomingMessage,
  terminalWsCloseReasonFromFailure,
  terminalWsUserMessageFromFailure,
  type AuthenticatedSessionUser,
} from '~/server/utils/session-auth'
import { consumeWsTerminalTicket } from '~/server/utils/ws-terminal-ticket'
import { getUserById } from '~/server/db/repositories/user.repository'

const WS_POLICY_VIOLATION = 1008

/**
 * WebSocket bridge between an xterm.js client and an interactive shell.
 *
 * Protocol (client → server):
 *   1st message : {"type":"init","cols":N,"rows":M}   — open shell at given size
 *   subsequent  : raw text keystrokes forwarded to shell
 *                 {"type":"resize","cols":N,"rows":M}  — resize PTY
 *
 * Query: **sanId** (required, non-empty) — SSH session is always bound to that pool manager (Batch 2B.5).
 *
 * Auth (Batch 2B.6): same-origin **esos_session** cookie only — validated like `/api/*` before any **sanId**
 * handling. **admin** and **operator** only; **viewer** and anonymous clients are rejected (close **1008**).
 *
 * This avoids passing cols/rows in the URL query string which may be blocked
 * by intermediate reverse proxies / WAF rules.
 */

interface ResizeMessage {
  type: 'resize' | 'init'
  cols: number
  rows: number
}

interface PendingState {
  manager:     SSHSessionManager
  queue:       string[]   // input buffered before shell is ready
  initialized: boolean    // true = init message received, shell being opened
}

const peerShells  = new WeakMap<object, ClientChannel>()
const peerPending = new WeakMap<object, PendingState>()

function getPoolManagerOrThrow(sanId: string): SSHSessionManager {
  const mgr = getSSHPool().get(sanId)
  if (!mgr) throw new Error(`SAN inconnu ou non connecté : ${sanId}`)
  return mgr
}

function auditTerminalOpen(entry: Record<string, unknown>) {
  console.log('[WS Terminal][audit]', JSON.stringify(entry))
}

function closePolicy(peer: any, closeReason: string, userMessage: string) {
  try {
    peer.send(`\x1b[33m${userMessage}\x1b[0m\r\n`)
    peer.close(WS_POLICY_VIOLATION, closeReason)
  } catch { /* ignore */ }
}

function parseTerminalQuery(req: IncomingMessage | undefined): { sanId: string; ticket: string } {
  const rawUrl = req?.url ?? ''
  try {
    const u = new URL(rawUrl, 'http://localhost')
    return {
      sanId:  (u.searchParams.get('sanId') ?? '').trim(),
      ticket: (u.searchParams.get('ticket') ?? '').trim(),
    }
  } catch {
    const q = rawUrl.includes('?') ? rawUrl.split('?').slice(1).join('?') : ''
    const params = new URLSearchParams(q)
    return {
      sanId:  (params.get('sanId') ?? '').trim(),
      ticket: (params.get('ticket') ?? '').trim(),
    }
  }
}

async function resolveTerminalUser(
  cookieHeader: string | undefined,
  ticket: string,
  sanId: string,
): Promise<
  | { ok: true; user: AuthenticatedSessionUser; via: 'cookie' | 'ticket' }
  | { ok: false; closeReason: string; userMessage: string; audit: Record<string, unknown> }
> {
  const token = extractSessionTokenFromCookieHeader(cookieHeader, SESSION_COOKIE.name)
  const auth    = await authenticateSessionFromToken(token)

  if (auth.ok) {
    if (!isTerminalWebSocketRoleAllowed(auth.user.role)) {
      return {
        ok: false,
        closeReason: 'esos:forbidden',
        userMessage: 'Droits insuffisants.',
        audit: {
          outcome: 'forbidden',
          userId:  auth.user.id,
          username: auth.user.username,
          role:    auth.user.role,
          sanId,
          detail:  'terminal_role',
        },
      }
    }
    return { ok: true, user: auth.user, via: 'cookie' }
  }

  const consumed = consumeWsTerminalTicket(ticket, sanId)
  if (consumed.ok) {
    const row = await getUserById(consumed.userId)
    if (!row || !row.active) {
      return {
        ok: false,
        closeReason: 'esos:invalid_ticket',
        userMessage: 'Session expirée. Reconnectez-vous.',
        audit: { outcome: 'invalid_ticket', userId: consumed.userId, sanId, detail: 'user_inactive' },
      }
    }
    const role = row.role as AuthenticatedSessionUser['role']
    if (!isTerminalWebSocketRoleAllowed(role)) {
      return {
        ok: false,
        closeReason: 'esos:forbidden',
        userMessage: 'Droits insuffisants.',
        audit: {
          outcome: 'forbidden',
          userId: row.id,
          username: row.username,
          role,
          sanId,
          detail: 'terminal_role',
        },
      }
    }
    return {
      ok: true,
      user: {
        id:             row.id,
        username:       row.username,
        role,
        sessionVersion: row.sessionVersion,
      },
      via: 'ticket',
    }
  }

  const forbidden = auth.failure.code === 'inactive'
  return {
    ok: false,
    closeReason: forbidden ? 'esos:forbidden' : terminalWsCloseReasonFromFailure(auth.failure),
    userMessage: forbidden ? 'Droits insuffisants.' : terminalWsUserMessageFromFailure(auth.failure),
    audit: {
      outcome: forbidden ? 'forbidden' : 'unauthorized',
      userId:  undefined,
      username: undefined,
      role:    undefined,
      sanId,
      detail:  ticket ? 'cookie_and_ticket_failed' : auth.failure.code,
    },
  }
}

async function openAndAttach(
  peer:    any,
  manager: SSHSessionManager,
  cols:    number,
  rows:    number,
  queued:  string[],
) {
  let shell: ClientChannel
  try {
    console.log(`[WS Terminal] opening shell ${cols}x${rows}…`)
    shell = await manager.openShell(cols, rows)
    console.log('[WS Terminal] shell opened OK')
  } catch (err) {
    console.error('[WS Terminal] openShell failed:', (err as Error).message)
    try {
      peer.send(`\x1b[31mUnable to open SSH shell: ${(err as Error).message}\x1b[0m\r\n`)
      peer.close(1011, 'Shell open failed')
    } catch { /* ignore */ }
    return
  }

  peerShells.set(peer as unknown as object, shell)

  shell.on('data', (data: Buffer) => {
    try { peer.send(data.toString('utf-8')) } catch { /* peer closed */ }
  })
  shell.stderr.on('data', (data: Buffer) => {
    try { peer.send(data.toString('utf-8')) } catch { /* peer closed */ }
  })
  shell.on('close', () => {
    try { peer.close(1000, 'Shell closed') } catch { /* ignore */ }
  })
  shell.on('error', (err: Error) => {
    console.error('[WS Terminal] Shell error:', err.message)
    try { peer.close(1011, err.message) } catch { /* ignore */ }
  })

  // Replay any keyboard input buffered while the shell was opening
  for (const msg of queued) {
    if (!shell.destroyed) shell.write(msg)
  }
}

export default defineWebSocketHandler({
  async open(peer) {
    const req          = peer.request as IncomingMessage | undefined
    const cookieHeader = readCookieHeaderFromIncomingMessage(req)
    const { sanId, ticket } = parseTerminalQuery(req)

    const resolved = await resolveTerminalUser(cookieHeader, ticket, sanId)
    if (!resolved.ok) {
      auditTerminalOpen(resolved.audit)
      closePolicy(peer, resolved.closeReason, resolved.userMessage)
      return
    }

    const { id: userId, username, role } = resolved.user

    if (!sanId) {
      auditTerminalOpen({
        outcome: 'san_id_required',
        userId,
        username,
        role,
        sanId: undefined,
        detail: 'missing_or_empty_sanId',
      })
      console.warn('[WS Terminal] rejected open — missing or empty sanId')
      closePolicy(peer, 'esos:san_id_required', 'SAN introuvable pour ce terminal.')
      return
    }

    console.log('[WS Terminal] open —', req?.url ?? '', '| sanId:', sanId, '| user:', username, '| via:', resolved.via)

    let manager: SSHSessionManager
    try {
      manager = getPoolManagerOrThrow(sanId)
    } catch (err) {
      auditTerminalOpen({
        outcome: 'san_not_found',
        userId,
        username,
        role,
        sanId,
        detail: (err as Error).message,
      })
      console.error('[WS Terminal] manager not found:', (err as Error).message)
      closePolicy(peer, 'esos:san_not_found', 'SSH non connecté pour ce SAN. Réessayez depuis la page SAN.')
      return
    }

    console.log('[WS Terminal] manager status:', manager.getStatus())
    if (!manager.isReady()) {
      auditTerminalOpen({
        outcome: 'ssh_not_ready',
        userId,
        username,
        role,
        sanId,
        detail: manager.getStatus(),
      })
      closePolicy(peer, 'esos:ssh_not_ready', 'SSH du SAN pas prêt. Attendez « SSH connecté » puis reconnectez.')
      return
    }

    auditTerminalOpen({
      outcome: 'accepted',
      userId,
      username,
      role,
      sanId,
      detail: `pending_shell:${resolved.via}`,
    })

    // Shell opened lazily on first message so we get the correct terminal dimensions
    peerPending.set(peer as unknown as object, { manager, queue: [], initialized: false })
  },

  async message(peer, message) {
    const raw = typeof message === 'string'
      ? message
      : (message.text?.() ?? String(message))

    const key     = peer as unknown as object
    const pending = peerPending.get(key)

    // ── Phase 1 : waiting for init message ───────────────────────────────
    if (pending && !pending.initialized) {
      let cols = 220, rows = 50
      if (raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw) as Partial<ResizeMessage>
          if ((parsed.type === 'init' || parsed.type === 'resize') && parsed.cols && parsed.rows) {
            cols = Math.max(80,  Math.min(500, parsed.cols))
            rows = Math.max(25,  Math.min(200, parsed.rows))
          }
        } catch { /* fall through to defaults */ }
      }
      pending.initialized = true
      openAndAttach(peer, pending.manager, cols, rows, pending.queue)
      return
    }

    // ── Phase 2 : init sent, shell still opening ──────────────────────────
    if (pending && pending.initialized) {
      const shell = peerShells.get(key)
      if (!shell) {
        // Buffer raw input, ignore JSON control messages
        if (!raw.startsWith('{')) pending.queue.push(raw)
        return
      }
      // Shell is now ready — clean up pending state and fall through
      peerPending.delete(key)
    }

    // ── Phase 3 : shell ready ─────────────────────────────────────────────
    const shell = peerShells.get(key)
    if (!shell || shell.destroyed) return

    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw) as Partial<ResizeMessage>
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          shell.setWindow(parsed.rows, parsed.cols, 0, 0)
          return
        }
      } catch { /* fall through */ }
    }

    shell.write(raw)
  },

  close(peer) {
    const key   = peer as unknown as object
    const shell = peerShells.get(key)
    if (shell && !shell.destroyed) {
      try { shell.signal('HUP') } catch { /* signal may not be supported */ }
      try { shell.end() } catch { /* ignore */ }
    }
    peerShells.delete(key)
    peerPending.delete(key)
  },

  error(peer) {
    const key   = peer as unknown as object
    const shell = peerShells.get(key)
    if (shell && !shell.destroyed) {
      try { shell.end() } catch { /* ignore */ }
    }
    peerShells.delete(key)
    peerPending.delete(key)
  },
})
