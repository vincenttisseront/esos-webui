import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('PUBLIC_API_PREFIXES', () => {
  const source = readFileSync(join(process.cwd(), 'server/middleware/auth.ts'), 'utf-8')

  it('allows unauthenticated GET /api/app/version', () => {
    expect(source).toContain("'/api/app/version'")
  })

  it('does not whitelist /api/auth/me', () => {
    expect(source).not.toContain("'/api/auth/me'")
  })
})
