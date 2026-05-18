/**
 * Unit tests for `requireSanIdQuery` (Batch 2B.1).
 * Run: npx vitest run tests/san-query.test.ts
 */
import { describe, it, expect } from 'vitest'
import { createEvent } from 'h3'
import { requireSanIdQuery } from '../server/utils/san-query'

function expectMissingSanId(fn: () => void) {
  try {
    fn()
    expect.fail('expected throw')
  } catch (e: unknown) {
    const err = e as { statusCode?: number; statusMessage?: string }
    expect(err.statusCode).toBe(400)
    expect(err.statusMessage).toMatch(/sanId/i)
  }
}

describe('requireSanIdQuery', () => {
  it('returns sanId from query string', () => {
    const event = createEvent({ method: 'GET', url: 'http://localhost/api/x?sanId=san-1' })
    expect(requireSanIdQuery(event)).toBe('san-1')
  })

  it('trims surrounding whitespace', () => {
    const event = createEvent({ method: 'GET', url: 'http://localhost/api/x?sanId=%20%20uuid%20%20' })
    expect(requireSanIdQuery(event)).toBe('uuid')
  })

  it('throws 400 when sanId is absent', () => {
    const event = createEvent({ method: 'GET', url: 'http://localhost/api/x' })
    expectMissingSanId(() => requireSanIdQuery(event))
  })

  it('throws 400 when sanId is empty string', () => {
    const event = createEvent({ method: 'GET', url: 'http://localhost/api/x?sanId=' })
    expectMissingSanId(() => requireSanIdQuery(event))
  })

  it('throws 400 when sanId is only whitespace', () => {
    const event = createEvent({ method: 'GET', url: 'http://localhost/api/x?sanId=%20%20%20' })
    expectMissingSanId(() => requireSanIdQuery(event))
  })

  it('throws 400 when sanId is not a string (array)', () => {
    const event = createEvent({ method: 'GET', url: 'http://localhost/api/x?sanId=a&sanId=b' })
    expectMissingSanId(() => requireSanIdQuery(event))
  })
})
