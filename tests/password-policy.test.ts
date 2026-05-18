import { describe, expect, it } from 'vitest'
import {
  PASSWORD_MIN_LENGTH,
  buildPasswordComplexityMessage,
  evaluatePasswordComplexity,
} from '../utils/password-policy'

describe('password-policy', () => {
  it('rejects weak password and returns missing rules', () => {
    const result = evaluatePasswordComplexity('abc')

    expect(result.isValid).toBe(false)
    expect(result.score).toBeLessThan(result.maxScore)

    const message = buildPasswordComplexityMessage('abc')
    expect(message).toBeTruthy()
    expect(message).toContain(`Au moins ${PASSWORD_MIN_LENGTH} caracteres`)
  })

  it('accepts strong password', () => {
    const strong = 'StrongPass!2026'
    const result = evaluatePasswordComplexity(strong)

    expect(result.isValid).toBe(true)
    expect(result.score).toBe(result.maxScore)
    expect(buildPasswordComplexityMessage(strong)).toBeNull()
  })
})
