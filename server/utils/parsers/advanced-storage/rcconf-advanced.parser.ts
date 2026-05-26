import type { AdvancedStorageRcFlags } from '../../../../types/advanced-storage'

export function parseAdvancedRcConf(raw: string): AdvancedStorageRcFlags {
  const isYes = (key: string): boolean => {
    const escaped = key.replace(/\./g, '\\.')
    const m = raw.match(new RegExp(`${escaped}=["']?(YES|NO)["']?`, 'i'))
    return m?.[1]?.toUpperCase() === 'YES'
  }

  return {
    drbd:       isYes('rc.drbd_enable'),
    multipathd: isYes('rc.multipathd_enable'),
    mhvtl:      isYes('rc.mhvtl_enable'),
    dmcache:    isYes('rc.dmcache_enable'),
    rbdmap:     isYes('rc.rbdmap_enable'),
  }
}

export function parseServiceStatus(raw: string): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const line of raw.split('\n')) {
    const m = line.trim().match(/^(\w+)=running$/)
    if (m) out[m[1]!] = true
  }
  return out
}
