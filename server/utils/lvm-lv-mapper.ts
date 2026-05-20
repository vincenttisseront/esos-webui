import {
  pickLvBackingPathFromReport,
  scstDeviceNamesForLvPaths,
} from '~/utils/lvm-lv-path'
import type { LogicalVolume, LvmUsedBy } from './lvm-types'

export type ParsedLvRow = {
  name: string
  vgName: string
  lvPath: string
  lvDmPath: string
  sizeBytes: number
  uuid: string
  attr: string
  active: boolean
}

export function mapParsedLvToLogicalVolume(
  raw: ParsedLvRow,
  scstMap: Map<string, string[]>,
  blockByPath: Map<string, { mountpoint?: string }>,
): LogicalVolume {
  const { backingPath, displayName, pathCandidates } = pickLvBackingPathFromReport(
    raw.vgName,
    raw.name,
    { lvPath: raw.lvPath, lvDmPath: raw.lvDmPath },
  )
  const scstNames = scstDeviceNamesForLvPaths(scstMap, pathCandidates)
  const usedBy: LvmUsedBy[] = []
  if (scstNames.length) usedBy.push('scst')
  const dev = blockByPath.get(backingPath)
    ?? pathCandidates.map(p => blockByPath.get(p)).find(Boolean)
  if (dev?.mountpoint) usedBy.push('mounted')

  return {
    name: raw.name,
    path: backingPath,
    displayName,
    pathCandidates,
    vgName: raw.vgName,
    sizeBytes: raw.sizeBytes,
    uuid: raw.uuid,
    attr: raw.attr,
    active: raw.active,
    usedBy,
    scstDeviceNames: scstNames.length ? scstNames : undefined,
  }
}

export function allLvPathCandidates(lvs: LogicalVolume[]): Set<string> {
  const paths = new Set<string>()
  for (const lv of lvs) {
    paths.add(lv.path)
    for (const p of lv.pathCandidates ?? []) paths.add(p)
  }
  return paths
}
