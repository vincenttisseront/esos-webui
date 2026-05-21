/**
 * Client-side mapping for /ws/terminal close reasons and auth errors.
 */

export type TerminalWsUiErrorKind =
  | 'session_expired'
  | 'forbidden'
  | 'san_missing'
  | 'san_not_connected'
  | 'ssh_not_ready'
  | 'connection_closed'
  | 'websocket_error'
  | 'ticket_failed'
  | 'ticket_rejected'
  | 'upgrade_failed'
  | 'proxy_failure'
  | 'backend_closed'

const CLOSE_REASON_PREFIX = 'esos:'

export function buildTerminalWsUrl(params: {
  host: string
  protocol: 'ws:' | 'wss:'
  sanId: string
  ticket: string
}): string {
  const q = new URLSearchParams({
    sanId: params.sanId,
    ticket: params.ticket,
  })
  return `${params.protocol}//${params.host}/ws/terminal?${q.toString()}`
}

/** Map server close reason (esos:code) to i18n key under terminal.ws.errors.* */
export function terminalWsCloseI18nKey(code: number, reason: string): string {
  const r = reason.trim()
  if (r.startsWith(CLOSE_REASON_PREFIX)) {
    const sub = r.slice(CLOSE_REASON_PREFIX.length)
    switch (sub) {
      case 'missing_token':
      case 'invalid_token':
      case 'user_not_found':
      case 'session_revoked':
        return 'terminal.ws.errors.session_expired'
      case 'forbidden':
      case 'terminal_role':
        return 'terminal.ws.errors.forbidden'
      case 'san_id_required':
        return 'terminal.ws.errors.san_missing'
      case 'san_not_found':
        return 'terminal.ws.errors.san_not_connected'
      case 'ssh_not_ready':
        return 'terminal.ws.errors.ssh_not_ready'
      case 'invalid_ticket':
        return 'terminal.ws.errors.ticket_rejected'
      default:
        return 'terminal.ws.errors.backend_closed'
    }
  }
  if (code === 1008 && /unauthorized/i.test(r)) {
    return 'terminal.ws.errors.session_expired'
  }
  if (code === 1008 && /forbidden/i.test(r)) {
    return 'terminal.ws.errors.forbidden'
  }
  return 'terminal.ws.errors.connection_closed'
}

/**
 * Classify close when the browser/proxy may strip the close reason (common behind Traefik/nginx).
 */
export function classifyTerminalWsClose(params: {
  code: number
  reason: string
  wasEverOpen: boolean
}): string {
  const { code, reason, wasEverOpen } = params
  const mapped = terminalWsCloseI18nKey(code, reason)
  if (mapped !== 'terminal.ws.errors.connection_closed') return mapped

  if (!wasEverOpen) {
    if (code === 1006 || code === 1005 || code === 0) {
      return 'terminal.ws.errors.upgrade_failed'
    }
    if (code === 1008) {
      return 'terminal.ws.errors.ticket_rejected'
    }
    return 'terminal.ws.errors.proxy_failure'
  }

  if (code === 1008) return 'terminal.ws.errors.backend_closed'
  return mapped
}

export function terminalHttpErrorKind(status: number): TerminalWsUiErrorKind {
  if (status === 401) return 'session_expired'
  if (status === 403) return 'forbidden'
  return 'ticket_failed'
}
