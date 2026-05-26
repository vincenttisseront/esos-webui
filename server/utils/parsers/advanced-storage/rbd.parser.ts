import type { RbdMapping } from '../../../../types/advanced-storage'

export function parseRbdShowmapped(raw: string): RbdMapping[] {
  const mappings: RbdMapping[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('DEVICE')) continue
    const parts = t.split(/\s+/)
    if (parts.length < 3) continue
    const device = parts[0]!.startsWith('/dev') ? parts[0]! : `/dev/rbd/${parts[0]}`
    const poolImage = parts[1]!
    const [pool, ...rest] = poolImage.split('/')
    mappings.push({
      device,
      pool:  pool ?? '',
      image: rest.join('/') || poolImage,
      snap:  parts[2] !== '-' ? parts[2] : undefined,
    })
  }
  return mappings
}

export function parseRbdmapConfig(raw: string): string[] {
  const paths: string[] = []
  if (raw.includes('RBDMAP_PRESENT=1')) paths.push('/etc/ceph/rbdmap')
  if (raw.includes('RBDMAP_ALT=')) {
    const m = raw.match(/RBDMAP_ALT=(\S+)/)
    if (m) paths.push(m[1]!)
  }
  return paths
}
