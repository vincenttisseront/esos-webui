/** LVM logical volume device path resolution (shared client/server). */

export function lvmMapperSegment(name: string): string {
  return name.replace(/-/g, '--')
}

export function lvmMapperDeviceName(vgName: string, lvName: string): string {
  return `${lvmMapperSegment(vgName)}-${lvmMapperSegment(lvName)}`
}

export function lvmMapperDevicePath(vgName: string, lvName: string): string {
  return `/dev/mapper/${lvmMapperDeviceName(vgName, lvName)}`
}

export function lvDisplayName(vgName: string, lvName: string): string {
  return `${vgName}/${lvName}`
}

export function buildLvPathCandidates(
  vgName: string,
  lvName: string,
  reported?: { lvPath?: string; lvDmPath?: string },
): string[] {
  const out: string[] = []
  const add = (p?: string) => {
    const t = p?.trim()
    if (t && t.startsWith('/') && !out.includes(t)) out.push(t)
  }
  add(reported?.lvPath)
  add(reported?.lvDmPath)
  add(lvmMapperDevicePath(vgName, lvName))
  add(`/dev/${vgName}/${lvName}`)
  return out
}

/**
 * Choose the best backing path from LVM JSON fields (no block-device probe).
 * Prefers lv_dm_path and device-mapper paths over legacy /dev/vg/lv symlinks.
 */
export function pickLvBackingPathFromReport(
  vgName: string,
  lvName: string,
  reported?: { lvPath?: string; lvDmPath?: string },
): { backingPath: string; displayName: string; pathCandidates: string[] } {
  const pathCandidates = buildLvPathCandidates(vgName, lvName, reported)
  const lvPath = reported?.lvPath?.trim() ?? ''
  const lvDmPath = reported?.lvDmPath?.trim() ?? ''

  let backingPath = ''
  if (lvDmPath.startsWith('/dev/')) {
    backingPath = lvDmPath
  } else if (lvPath.startsWith('/dev/mapper/')) {
    backingPath = lvPath
  } else if (lvPath.startsWith('/dev/')) {
    backingPath = lvPath
  } else {
    backingPath = pathCandidates.find(p => p.startsWith('/dev/mapper/'))
      ?? pathCandidates[pathCandidates.length - 1]
      ?? lvmMapperDevicePath(vgName, lvName)
  }

  return {
    backingPath,
    displayName: lvDisplayName(vgName, lvName),
    pathCandidates,
  }
}

export function scstDeviceNamesForLvPaths(
  scstMap: Map<string, string[]>,
  pathCandidates: string[],
): string[] {
  const names = new Set<string>()
  for (const p of pathCandidates) {
    for (const n of scstMap.get(p) ?? []) names.add(n)
  }
  return [...names]
}
