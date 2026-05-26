import type { LvmCacheVolume } from '../../../../types/advanced-storage'

export function parseLvmCacheLvs(raw: string): LvmCacheVolume[] {
  const volumes: LvmCacheVolume[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const parts = t.split(/\s+/).filter(Boolean)
    if (parts.length < 4) continue
    const layout = parts[2] ?? ''
    const segtype = parts[3] ?? ''
    if (!/cache/i.test(layout) && !/cache/i.test(segtype)) continue
    volumes.push({
      lv:          `${parts[1]}/${parts[0]}`,
      vg:          parts[1]!,
      layout,
      segtype,
      cacheMode:   parts[4],
      origin:      parts[5],
      dataPercent: parts[6] ? Number.parseFloat(parts[6]) : undefined,
    })
  }
  return volumes
}
