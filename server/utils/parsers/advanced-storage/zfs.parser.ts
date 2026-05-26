import type { ZfsDataset, ZfsPool } from '../../../../types/advanced-storage'

export function parseZpoolList(raw: string): ZfsPool[] {
  const pools: ZfsPool[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const parts = t.split('\t')
    if (parts.length >= 3) {
      pools.push({
        name:      parts[0]!,
        sizeBytes: Number.parseInt(parts[1]!, 10) || 0,
        freeBytes: Number.parseInt(parts[2]!, 10) || 0,
        health:    parts[3] ?? 'unknown',
      })
      continue
    }
    const sp = t.split(/\s+/)
    if (sp.length >= 4) {
      pools.push({
        name:      sp[0]!,
        sizeBytes: Number.parseInt(sp[1]!, 10) || 0,
        freeBytes: Number.parseInt(sp[2]!, 10) || 0,
        health:    sp[3]!,
      })
    }
  }
  return pools
}

export function parseZfsList(raw: string): ZfsDataset[] {
  const datasets: ZfsDataset[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const parts = t.split('\t')
    if (parts.length >= 4) {
      datasets.push({
        name:       parts[0]!,
        usedBytes:  Number.parseInt(parts[1]!, 10) || 0,
        availBytes: Number.parseInt(parts[2]!, 10) || 0,
        mountpoint: parts[3] ?? '-',
      })
    }
  }
  return datasets
}
