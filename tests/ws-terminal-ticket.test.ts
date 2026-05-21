import { describe, it, expect, beforeAll } from 'vitest'
import {
  issueWsTerminalTicket,
  verifyWsTerminalTicket,
  clearWsTerminalTickets,
} from '../server/utils/ws-terminal-ticket'
import {
  classifyTerminalWsClose,
  terminalWsCloseI18nKey,
} from '../utils/terminal-ws-client'

beforeAll(() => {
  process.env.NUXT_JWT_SECRET = 'a'.repeat(32)
  clearWsTerminalTickets()
})

describe('ws-terminal-ticket', () => {
  it('issues and verifies a signed ticket for matching sanId', async () => {
    const ticket = await issueWsTerminalTicket('user-1', 'san-a')
    expect(await verifyWsTerminalTicket(ticket, 'san-a')).toEqual({ ok: true, userId: 'user-1' })
  })

  it('rejects ticket for wrong sanId', async () => {
    const ticket = await issueWsTerminalTicket('user-1', 'san-a')
    expect(await verifyWsTerminalTicket(ticket, 'san-b')).toEqual({ ok: false, reason: 'san_mismatch' })
  })

  it('rejects empty ticket', async () => {
    expect(await verifyWsTerminalTicket('', 'san-a')).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('terminal-ws-client', () => {
  it('maps esos close reasons to i18n keys', () => {
    expect(terminalWsCloseI18nKey(1008, 'esos:missing_token')).toBe('terminal.ws.errors.session_expired')
    expect(terminalWsCloseI18nKey(1008, 'esos:forbidden')).toBe('terminal.ws.errors.forbidden')
    expect(terminalWsCloseI18nKey(1008, 'esos:invalid_ticket')).toBe('terminal.ws.errors.ticket_rejected')
  })

  it('classifies abnormal close before open as upgrade failure', () => {
    expect(classifyTerminalWsClose({ code: 1006, reason: '', wasEverOpen: false }))
      .toBe('terminal.ws.errors.upgrade_failed')
  })
})
