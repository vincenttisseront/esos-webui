export const PASSWORD_MIN_LENGTH = 12

export interface PasswordCheckItem {
  id: 'length' | 'lowercase' | 'uppercase' | 'digit' | 'special'
  label: string
  ok: boolean
}

export interface PasswordComplexityResult {
  isValid: boolean
  score: number
  maxScore: number
  checks: PasswordCheckItem[]
}

const LOWERCASE_RE = /[a-z]/
const UPPERCASE_RE = /[A-Z]/
const DIGIT_RE = /\d/
const SPECIAL_RE = /[^A-Za-z0-9]/

export function evaluatePasswordComplexity(password: string): PasswordComplexityResult {
  const checks: PasswordCheckItem[] = [
    {
      id: 'length',
      label: `Au moins ${PASSWORD_MIN_LENGTH} caracteres`,
      ok: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'lowercase',
      label: 'Au moins une lettre minuscule',
      ok: LOWERCASE_RE.test(password),
    },
    {
      id: 'uppercase',
      label: 'Au moins une lettre majuscule',
      ok: UPPERCASE_RE.test(password),
    },
    {
      id: 'digit',
      label: 'Au moins un chiffre',
      ok: DIGIT_RE.test(password),
    },
    {
      id: 'special',
      label: 'Au moins un caractere special',
      ok: SPECIAL_RE.test(password),
    },
  ]

  const score = checks.reduce((acc, check) => acc + (check.ok ? 1 : 0), 0)

  return {
    isValid: score === checks.length,
    score,
    maxScore: checks.length,
    checks,
  }
}

export function buildPasswordComplexityMessage(password: string): string | null {
  const result = evaluatePasswordComplexity(password)
  if (result.isValid) return null

  const missing = result.checks.filter((check) => !check.ok).map((check) => check.label)

  return `Le mot de passe ne respecte pas la complexite requise: ${missing.join(', ')}`
}