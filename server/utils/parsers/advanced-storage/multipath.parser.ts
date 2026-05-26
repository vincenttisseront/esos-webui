import type { MultipathMap } from '../../../../types/advanced-storage'

export function parseMultipathLl(raw: string): MultipathMap[] {
  if (!raw || raw.includes('MULTIPATH_UNAVAILABLE')) return []

  const maps: MultipathMap[] = []
  const blocks = raw.split(/\n(?=mpath[a-z0-9]+|dm-\d+)/i)

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) continue

    const header = lines[0]!
    const dmMatch = header.match(/^(mpath\d+|dm-\d+)\s+\((.+)\)/)
    const alias = dmMatch?.[1] ?? header.split(/\s+/)[0] ?? 'unknown'
    const wwidMatch = header.match(/(\d[\da-fA-F]+)/)
    const wwid = wwidMatch?.[1] ?? ''

    const paths: MultipathMap['paths'] = []
    for (const line of lines.slice(1)) {
      const pm = line.match(/^(\S+)\s+(\S.*)$/)
      if (pm) paths.push({ device: pm[1]!, state: pm[2]!.trim() })
    }

    maps.push({
      wwid,
      alias,
      dmDevice: alias.startsWith('dm-') ? `/dev/mapper/${alias}` : `/dev/mapper/${alias}`,
      pathCount: paths.length,
      paths,
    })
  }

  if (maps.length === 0) {
    const simple = raw.matchAll(/^(mpath[a-z0-9]+)\s+\(([^)]+)\)/gim)
    for (const m of simple) {
      maps.push({
        wwid: m[2] ?? '',
        alias: m[1]!,
        dmDevice: `/dev/mapper/${m[1]}`,
        pathCount: 0,
        paths: [],
      })
    }
  }

  return maps
}
