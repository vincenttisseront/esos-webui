import type { SemverDiff } from './types'

// Nettoie un semver: supprime ^, ~, >=, espaces, "v" et les suffixes pre-release.
export function cleanVersion(v: string): string {
  return v.replace(/^[\^~>=v\s]+/, '').trim().split('-')[0]
}

export function parseSemver(v: string): [number, number, number] | null {
  const clean = cleanVersion(v)
  const parts = clean.split('.').map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return null
  return [parts[0], parts[1], parts[2]]
}

/** -1 = a < b, 0 = equal, 1 = a > b, null = invalid */
export function compareSemverOrder(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff < 0) return -1
    if (diff > 0) return 1
  }
  return 0
}

export type SemverRelative = 'behind' | 'equal' | 'ahead' | 'invalid'

export function relativeSemver(installed: string, latest: string): SemverRelative {
  const order = compareSemverOrder(installed, latest)
  if (order === null) return 'invalid'
  if (order < 0) return 'behind'
  if (order > 0) return 'ahead'
  return 'equal'
}

export function compareSemver(installed: string, latest: string): SemverDiff {
  const rel = relativeSemver(installed, latest)
  if (rel === 'invalid') return 'unknown'
  if (rel === 'equal' || rel === 'ahead') return 'up-to-date'

  const i = parseSemver(installed)!
  const l = parseSemver(latest)!
  const [iMaj, iMin, iPatch] = i
  const [lMaj, lMin, lPatch] = l

  if (lMaj > iMaj) return 'major'
  if (lMaj === iMaj && lMin > iMin) return 'minor'
  if (lMaj === iMaj && lMin === iMin && lPatch > iPatch) return 'patch'
  return 'up-to-date'
}
