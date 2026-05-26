export interface LsblkAdvancedRow {
  name:       string
  path:       string
  sizeBytes:  number
  type:       string
  fstype?:    string
  mountpoint?: string
}

export function parseLsblkAdvancedJson(raw: string): LsblkAdvancedRow[] {
  if (!raw || raw.trim() === '{}' || raw.includes('LSBLK_UNAVAILABLE')) return []
  try {
    const data = JSON.parse(raw) as { blockdevices?: Array<Record<string, unknown>> }
    const rows: LsblkAdvancedRow[] = []
    const walk = (nodes: Array<Record<string, unknown>> | undefined) => {
      if (!nodes) return
      for (const n of nodes) {
        const path = String(n.path ?? `/dev/${n.name ?? ''}`)
        rows.push({
          name:       String(n.name ?? ''),
          path,
          sizeBytes:  Number.parseInt(String(n.size ?? '0'), 10) || 0,
          type:       String(n.type ?? ''),
          fstype:     n.fstype ? String(n.fstype) : undefined,
          mountpoint: n.mountpoint ? String(n.mountpoint) : undefined,
        })
        walk(n.children as Array<Record<string, unknown>> | undefined)
      }
    }
    walk(data.blockdevices)
    return rows
  } catch {
    return []
  }
}

export function isAdvancedBlockPath(path: string): boolean {
  return /^\/dev\/(drbd\d+|mapper\/|rbd\/|bcache)/.test(path)
    || path.includes('/dev/mapper/mpath')
    || path.includes('/dev/mapper/dm-')
}
