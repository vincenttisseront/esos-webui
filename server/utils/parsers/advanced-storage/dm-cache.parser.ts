import type { DmCacheTarget } from '../../../../types/advanced-storage'

export function parseDmCacheTable(raw: string): DmCacheTarget[] {
  const targets: DmCacheTarget[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || !/cache/i.test(t)) continue
    const parts = t.split(':')
    const name = parts[0]?.trim() ?? ''
    if (!name) continue
    const table = parts[1] ?? ''
    const originMatch = table.match(/origin\s+(\S+)/)
    const modeMatch = table.match(/(writethrough|writeback|passthrough)/i)
    targets.push({
      name,
      origin:    originMatch?.[1],
      cacheMode: modeMatch?.[1],
    })
  }
  return targets
}
