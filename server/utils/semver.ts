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

export function compareSemver(installed: string, latest: string): SemverDiff {
  const i = parseSemver(installed)
  const l = parseSemver(latest)

  if (!i || !l) return 'unknown'

  const [iMaj, iMin, iPatch] = i
  const [lMaj, lMin, lPatch] = l

  if (lMaj > iMaj) return 'major'
  if (lMaj === iMaj && lMin > iMin) return 'minor'
  if (lMaj === iMaj && lMin === iMin && lPatch > iPatch) return 'patch'
  return 'up-to-date'
}
