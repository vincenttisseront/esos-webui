import type { FileSystemMount, FsMountRole, FsType, MountHealth } from '~/types/filesystem'
import { classifyMountRole } from '~/utils/fs-mount-classifier'

export const FS_TYPES = new Set(['xfs', 'ext4', 'ext3', 'ext2', 'btrfs'])

export function isFsMountPath(mountPoint: string): boolean {
  if (!mountPoint.startsWith('/')) return false
  if (mountPoint === '/' || mountPoint.startsWith('/proc') || mountPoint.startsWith('/sys')) {
    return false
  }
  return true
}

export function normalizeFsType(fstype: string): FsType | string {
  const t = fstype.trim().toLowerCase()
  if (FS_TYPES.has(t)) return t as FsType
  if (t === 'auto' || !t) return 'xfs'
  return t
}

function mountHealth(usedPct: number): MountHealth | undefined {
  if (usedPct >= 95) return 'full'
  if (usedPct >= 85) return 'degraded'
  return 'ok'
}

export function parseFindmntLines(stdout: string): Array<{
  target: string
  source: string
  fstype: string
}> {
  const out: Array<{ target: string; source: string; fstype: string }> = []
  for (const line of stdout.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('TARGET')) continue
    const parts = t.split(/\s+/)
    if (parts.length < 3) continue
    const target = parts[0]
    const source = parts[1]
    const fstype = parts[2]
    if (!isFsMountPath(target)) continue
    if (!FS_TYPES.has(fstype) && fstype !== 'auto') continue
    out.push({ target, source, fstype })
  }
  return out
}

/** Parse `findmnt -J` JSON (filesystems[].target, .source, .fstype). */
export function parseFindmntJson(stdout: string): Array<{
  target: string
  source: string
  fstype: string
}> {
  const out: Array<{ target: string; source: string; fstype: string }> = []
  try {
    const data = JSON.parse(stdout) as {
      filesystems?: Array<{
        target?: string
        source?: string
        fstype?: string
      }>
    }
    for (const fs of data.filesystems ?? []) {
      const target = fs.target?.trim() ?? ''
      const source = fs.source?.trim() ?? ''
      const fstype = fs.fstype?.trim() ?? ''
      if (!isFsMountPath(target)) continue
      if (fstype && !FS_TYPES.has(fstype) && fstype !== 'auto') continue
      out.push({ target, source, fstype: fstype || 'xfs' })
    }
  } catch {
    return out
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkLsblk(node: any, acc: Array<{ mountpoint: string; path: string; fstype: string }>) {
  const mp = node.mountpoint as string | null | undefined
  const path = (node.path ?? `/dev/${node.name}`) as string
  const fstype = (node.fstype ?? '') as string
  if (mp && isFsMountPath(mp) && fstype && FS_TYPES.has(fstype)) {
    acc.push({ mountpoint: mp, path, fstype })
  }
  for (const child of node.children ?? []) {
    walkLsblk(child, acc)
  }
}

export function parseLsblkMounts(stdout: string): Array<{
  target: string
  source: string
  fstype: string
}> {
  const acc: Array<{ mountpoint: string; path: string; fstype: string }> = []
  try {
    const data = JSON.parse(stdout) as { blockdevices?: unknown[] }
    for (const dev of data.blockdevices ?? []) {
      walkLsblk(dev, acc)
    }
  } catch {
    return []
  }
  return acc.map(r => ({
    target: r.mountpoint,
    source: r.path,
    fstype: r.fstype,
  }))
}

export function parseDfBytesLine(line: string): {
  totalBytes: number
  usedBytes: number
  availBytes: number
} | null {
  const parts = line.trim().split(/\s+/)
  if (parts.length < 4) return null
  const total = Number.parseInt(parts[1], 10)
  const used = Number.parseInt(parts[2], 10)
  const avail = Number.parseInt(parts[3], 10)
  if (Number.isNaN(total)) return null
  return { totalBytes: total, usedBytes: used, availBytes: avail }
}

export function buildMountRow(
  m: { target: string; source: string; fstype: string },
  df: { totalBytes: number; usedBytes: number; availBytes: number } | undefined,
  source: FileSystemMount['source'],
  options?: { role?: FsMountRole; fileioFilenames?: string[] },
): FileSystemMount {
  const totalBytes = df?.totalBytes ?? 0
  const freeBytes = df?.availBytes ?? 0
  const usedPct = totalBytes > 0
    ? Math.round(((df?.usedBytes ?? 0) / totalBytes) * 100)
    : 0
  const role = options?.role ?? classifyMountRole(m.target, { fileioFilenames: options?.fileioFilenames })
  return {
    mountPoint: m.target,
    backingDevice: m.source,
    backingPaths: [m.source],
    role,
    fsType: normalizeFsType(m.fstype),
    totalBytes,
    freeBytes,
    usedPct,
    mounted: true,
    status: 'mounted',
    health: mountHealth(usedPct),
    source,
  }
}

export function mergeMountSources(
  sources: Array<{ rows: Array<{ target: string; source: string; fstype: string }>; source: FileSystemMount['source'] }>,
): Map<string, { target: string; source: string; fstype: string; sourceKind: FileSystemMount['source'] }> {
  const map = new Map<string, { target: string; source: string; fstype: string; sourceKind: FileSystemMount['source'] }>()
  const order: FileSystemMount['source'][] = ['findmnt', 'lsblk', 'df']
  for (const kind of order) {
    const block = sources.find(s => s.source === kind)
    if (!block) continue
    for (const row of block.rows) {
      if (!map.has(row.target)) {
        map.set(row.target, { ...row, sourceKind: kind })
      }
    }
  }
  return map
}

export function mergeMountWithDf(
  findmnt: Array<{ target: string; source: string; fstype: string }>,
  dfByMount: Map<string, { totalBytes: number; usedBytes: number; availBytes: number }>,
  source: FileSystemMount['source'] = 'findmnt',
): FileSystemMount[] {
  return findmnt.map(m => buildMountRow(m, dfByMount.get(m.target), source))
}

export function parseFstabLines(content: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const parts = t.split(/\s+/)
    if (parts.length < 2) continue
    const mount = parts[1]
    if (mount.startsWith('/')) map.set(mount, t)
  }
  return map
}

export function parseBlkidUuid(stdout: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of stdout.split('\n')) {
    const m = line.match(/^(\S+):\s+.*\s+UUID="([^"]+)"/)
    if (m) map.set(m[1], m[2])
  }
  return map
}
