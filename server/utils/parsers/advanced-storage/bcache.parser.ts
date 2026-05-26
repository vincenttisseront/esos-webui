import type { BcacheDevice } from '../../../../types/advanced-storage'

export function parseBcacheSysfs(raw: string): BcacheDevice[] {
  const devices: BcacheDevice[] = []
  const seen = new Set<string>()

  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const m = t.match(/bcache\/(\d+)/) ?? t.match(/\/block\/([^/]+)\/bcache/)
    if (m) {
      const name = m[1]!
      if (!seen.has(name)) {
        seen.add(name)
        devices.push({ name, backingPath: `/dev/${name}` })
      }
    }
    const stateMatch = t.match(/^([^=]+)=(.+)$/)
    if (stateMatch && stateMatch[1]!.includes('state')) {
      const devName = stateMatch[1]!.split('/').filter(Boolean).pop()
      if (devName) {
        const existing = devices.find(d => d.name === devName)
        if (existing) existing.state = stateMatch[2]
      }
    }
  }

  return devices
}
