import { describe, it, expect } from 'vitest'
import { buildTerminalWsUrl } from '../utils/terminal-ws-client'

describe('buildTerminalWsUrl', () => {
  it('targets /ws/terminal with sanId and ticket query params', () => {
    const url = buildTerminalWsUrl({
      host: 'esos.example',
      protocol: 'wss:',
      sanId: 'san-1',
      ticket: 'abc',
    })
    expect(url).toBe('wss://esos.example/ws/terminal?sanId=san-1&ticket=abc')
  })
})
