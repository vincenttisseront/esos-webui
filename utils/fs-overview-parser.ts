import type { FileSystemMount, FsType } from '~/types/filesystem'

const FS_TYPES = new Set(['xfs', 'ext4', 'ext3', 'ext2', 'btrfs'])

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
    if (!target.startsWith('/')) continue
    if (!FS_TYPES.has(fstype) && fstype !== 'auto') continue
    out.push({ target, source, fstype })
  }
  return out
}

export function parseDfBytesLine(line: string, mountPoint: string): {
  totalBytes: number
  usedBytes: number
  availBytes: number
} | null {
  const parts = line.trim().split(/\s+/)
  if (parts.length < 4) return null
  const totalKb = Number.parseInt(parts[1], 10)
  const usedKb = Number.parseInt(parts[2], 10)
  const availKb = Number.parseInt(parts[3], 10)
  if (Number.isNaN(totalKb)) return null
  return {
    totalBytes: totalKb * 1024,
    usedBytes: usedKb * 1024,
    availBytes: availKb * 1024,
  }
}

export function mergeMountWithDf(
  findmnt: Array<{ target: string; source: string; fstype: string }>,
  dfByMount: Map<string, { totalBytes: number; usedBytes: number; availBytes: number }>,
): FileSystemMount[] {
  const mounts: FileSystemMount[] = []
  for (const m of findmnt) {
    const df = dfByMount.get(m.target)
    const totalBytes = df?.totalBytes ?? 0
    const freeBytes = df?.availBytes ?? 0
    const usedPct = totalBytes > 0
      ? Math.round(((df?.usedBytes ?? 0) / totalBytes) * 100)
      : 0
    const fsType = (FS_TYPES.has(m.fstype) ? m.fstype : 'xfs') as FsType
    mounts.push({
      mountPoint: m.target,
      backingDevice: m.source,
      fsType,
      totalBytes,
      freeBytes,
      usedPct,
      mounted: true,
      source: 'findmnt',
    })
  }
  return mounts
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
