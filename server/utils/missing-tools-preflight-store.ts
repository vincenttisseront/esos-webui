const _tokens = new Map<string, { planToken: string; createdAt: number }>()

export function setMissingToolsPlanToken(stagingId: string, planToken: string): void {
  _tokens.set(stagingId, { planToken, createdAt: Date.now() })
}

export function getMissingToolsPlanToken(stagingId: string): string | null {
  const v = _tokens.get(stagingId)
  if (!v) return null
  // 30 minutes TTL
  if (Date.now() - v.createdAt > 30 * 60 * 1000) {
    _tokens.delete(stagingId)
    return null
  }
  return v.planToken
}

