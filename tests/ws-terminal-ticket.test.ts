import { describe, it, expect, beforeEach } from 'vitest'
import {
  issueWsTerminalTicket,
  consumeWsTerminalTicket,
  clearWsTerminalTickets,
} from '../server/utils/ws-terminal-ticket'
import { terminalWsCloseI18nKey } from '../utils/terminal-ws-client'

describe('ws-terminal-ticket', () => {
  beforeEach(() => {
    clearWsTerminalTickets()
  })

  it('issues and consumes a ticket once for matching sanId', () => {
    const ticket = issueWsTerminalTicket('user-1', 'san-a')
    expect(consumeWsTerminalTicket(ticket, 'san-a')).toEqual({ ok: true, userId: 'user-1' })
    expect(consumeWsTerminalTicket(ticket, 'san-a')).toEqual({ ok: false })
  })

  it('rejects ticket for wrong sanId', () => {
    const ticket = issueWsTerminalTicket('user-1', 'san-a')
    expect(consumeWsTerminalTicket(ticket, 'san-b')).toEqual({ ok: false })
  })
})

describe('terminal-ws-client', () => {
  it('maps esos close reasons to i18n keys', () => {
    expect(terminalWsCloseI18nKey(1008, 'esos:missing_token')).toBe('terminal.ws.errors.session_expired')
    expect(terminalWsCloseI18nKey(1008, 'esos:forbidden')).toBe('terminal.ws.errors.forbidden')
    expect(terminalWsCloseI18nKey(1008, 'esos:ssh_not_ready')).toBe('terminal.ws.errors.ssh_not_ready')
  })
})
