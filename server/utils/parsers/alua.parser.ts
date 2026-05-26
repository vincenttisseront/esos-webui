/**
 * ALUA sysfs parser — SDD v3.8 §3.4
 * Lines: /sys/kernel/scst_tgt/device_groups/.../file=value
 * Directories under devices/ and targets/ are listed as path-only lines (no =).
 */
import type { ALUAState, AluaDeviceGroup, AluaTargetRef, AluaTargetGroup } from '../../../types/alua'
import { flattenAluaGroups, inferTargetGroupRole } from '../alua-model'

const SYSFS_ROOT = '/sys/kernel/scst_tgt/device_groups'

type MutableDg = {
  devices:      Set<string>
  targetGroups: Map<string, MutableTg>
}

type MutableTg = {
  state:   ALUAState
  groupId: number | null
  targets: Map<string, MutableTarget>
}

type MutableTarget = {
  relTargetId: number | null
}

/**
 * Parse probe output: key=value sysfs files plus optional directory paths.
 */
export function parseALUASysfs(raw: string): AluaDeviceGroup[] {
  const dgMap = new Map<string, MutableDg>()

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.includes('device_groups')) continue

    const eqIdx = trimmed.lastIndexOf('=')
    if (eqIdx === -1) {
      ingestPathOnly(trimmed, dgMap)
      continue
    }

    const path  = trimmed.slice(0, eqIdx)
    const value = trimmed.slice(eqIdx + 1).trim()
    ingestFile(path, value, dgMap)
  }

  return [...dgMap.entries()]
    .map(([name, dg]) => materializeDeviceGroup(name, dg))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** @deprecated Use flattenAluaGroups(parseALUASysfs(raw)) for legacy flat rows. */
export function parseALUASysfsFlat(raw: string): ReturnType<typeof flattenAluaGroups> {
  return flattenAluaGroups(parseALUASysfs(raw))
}

function ingestPathOnly(path: string, dgMap: Map<string, MutableDg>): void {
  const parts = path.split('/').filter(Boolean)
  const dgIdx = parts.indexOf('device_groups')
  if (dgIdx === -1 || dgIdx + 1 >= parts.length) return

  const dgName = parts[dgIdx + 1]!
  const dg     = getOrCreateDg(dgMap, dgName)

  const devIdx = parts.indexOf('devices')
  if (devIdx !== -1 && devIdx + 1 < parts.length) {
    const devName = parts[devIdx + 1]!
    if (devName && devName !== 'devices') dg.devices.add(devName)
    return
  }

  const tgIdx = parts.indexOf('target_groups')
  if (tgIdx !== -1 && tgIdx + 1 < parts.length) {
    const tgName = parts[tgIdx + 1]!
    const tg     = getOrCreateTg(dg, tgName)
    const tgtIdx = parts.indexOf('targets')
    if (tgtIdx !== -1 && tgtIdx + 1 < parts.length) {
      const targetName = parts.slice(tgtIdx + 1).join('/')
      if (targetName) getOrCreateTarget(tg, targetName)
    }
  }
}

function ingestFile(path: string, value: string, dgMap: Map<string, MutableDg>): void {
  const parts = path.split('/').filter(Boolean)
  const dgIdx = parts.indexOf('device_groups')
  const tgIdx = parts.indexOf('target_groups')
  if (dgIdx === -1 || dgIdx + 1 >= parts.length) return

  const dgName = parts[dgIdx + 1]!
  const dg     = getOrCreateDg(dgMap, dgName)

  if (tgIdx === -1) return
  if (tgIdx + 1 >= parts.length) return

  const tgName = parts[tgIdx + 1]!
  const tg     = getOrCreateTg(dg, tgName)
  const leaf   = parts[parts.length - 1] ?? ''

  const tgtIdx = parts.indexOf('targets')
  if (tgtIdx !== -1 && tgtIdx + 1 < parts.length) {
    const targetParts = parts.slice(tgtIdx + 1)
    const targetLeaf  = targetParts[targetParts.length - 1] ?? ''

    if (targetLeaf === 'rel_tgt_id' || leaf === 'rel_tgt_id') {
      const targetName = targetParts.length > 1
        ? targetParts.slice(0, -1).join('/')
        : ''
      if (!targetName) return
      const id = parseInt(value, 10)
      if (!Number.isNaN(id)) getOrCreateTarget(tg, targetName).relTargetId = id
      return
    }
    getOrCreateTarget(tg, targetParts.join('/'))
    return
  }

  if (leaf === 'state') {
    tg.state = mapALUAState(value)
    return
  }
  if (leaf === 'group_id' || leaf === 'tg_id') {
    const id = parseInt(value, 10)
    if (!Number.isNaN(id)) tg.groupId = id
  }
}

function getOrCreateDg(dgMap: Map<string, MutableDg>, name: string): MutableDg {
  let dg = dgMap.get(name)
  if (!dg) {
    dg = { devices: new Set(), targetGroups: new Map() }
    dgMap.set(name, dg)
  }
  return dg
}

function getOrCreateTg(dg: MutableDg, name: string): MutableTg {
  let tg = dg.targetGroups.get(name)
  if (!tg) {
    tg = { state: 'unknown', groupId: null, targets: new Map() }
    dg.targetGroups.set(name, tg)
  }
  return tg
}

function getOrCreateTarget(tg: MutableTg, targetName: string): MutableTarget {
  let t = tg.targets.get(targetName)
  if (!t) {
    t = { relTargetId: null }
    tg.targets.set(targetName, t)
  }
  return t
}

function materializeDeviceGroup(name: string, dg: MutableDg): AluaDeviceGroup {
  const targetGroups: AluaTargetGroup[] = [...dg.targetGroups.entries()]
    .map(([tgName, tg]) => ({
      name:    tgName,
      groupId: tg.groupId,
      state:   tg.state,
      role:    inferTargetGroupRole(tgName),
      targets: [...tg.targets.entries()]
        .map(([targetName, t]) => {
          const ref: AluaTargetRef = { targetName }
          if (t.relTargetId != null) ref.relTargetId = t.relTargetId
          return ref
        })
        .sort((a, b) => a.targetName.localeCompare(b.targetName)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    name,
    devices: [...dg.devices].sort((a, b) => a.localeCompare(b)),
    targetGroups,
  }
}

function mapALUAState(raw: string): ALUAState {
  const valid: ALUAState[] = ['active', 'nonoptimized', 'standby', 'unavailable']
  return valid.includes(raw as ALUAState) ? (raw as ALUAState) : 'unknown'
}

export { SYSFS_ROOT }
