import type { AdvancedStorageToolInfo } from '../../../../types/advanced-storage'

const BINARIES = [
  'drbdadm', 'multipath', 'multipathd', 'zpool', 'zfs', 'rbd', 'ceph',
  'dmsetup', 'lvs', 'vtlcmd', 'mhvtl-cli',
] as const

export function parseToolsSection(raw: string): AdvancedStorageToolInfo {
  const binaryPaths: Record<string, string | null> = {}
  for (const name of BINARIES) binaryPaths[name] = null

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('bcache_sysfs=')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      if (trimmed.startsWith('/')) binaryPaths[trimmed.split('/').pop() ?? trimmed] = trimmed
      continue
    }
    const key = trimmed.slice(0, eq)
    const val = trimmed.slice(eq + 1).trim()
    if (key && val) binaryPaths[key] = val
  }

  const sysfsPresent: Record<string, boolean> = {
    bcache: raw.includes('bcache_sysfs=1'),
  }

  return { binaryPaths, sysfsPresent }
}
