import type { Target } from '~/types/esos'

/** Initiators seen in live sessions but not declared in any group on this target. */
export function discoveredInitiatorsForTarget(target: Target): string[] {
  const configured = new Set(
    target.groups.flatMap(g => g.initiators.map(i => i.trim().toLowerCase())),
  )
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of target.sessions) {
    const name = s.initiatorName?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (configured.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}
