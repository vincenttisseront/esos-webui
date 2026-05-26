import type {
  ALUAState,
  AluaDeviceGroup,
  AluaTargetGroupRole,
  ALUAGroupFlat,
} from '../../types/alua'
import type { ALUAGroup } from './types'

export type { AluaDeviceGroup, AluaTargetRef, AluaTargetGroup } from '../../types/alua'

export function inferTargetGroupRole(name: string): AluaTargetGroupRole {
  const n = name.trim().toLowerCase()
  if (n === 'local') return 'local'
  if (n === 'remote') return 'remote'
  return 'unknown'
}

export function flattenAluaGroups(deviceGroups: AluaDeviceGroup[]): ALUAGroup[] {
  const flat: ALUAGroup[] = []
  for (const dg of deviceGroups) {
    for (const tg of dg.targetGroups) {
      flat.push({
        deviceGroup: dg.name,
        targetGroup: tg.name,
        groupId:     tg.groupId ?? 0,
        state:       tg.state,
        targets:     tg.targets.map(t => t.targetName),
      })
    }
  }
  return flat
}

export function flattenAluaGroupsForApi(deviceGroups: AluaDeviceGroup[]): ALUAGroupFlat[] {
  return flattenAluaGroups(deviceGroups).map(g => ({
    deviceGroup: g.deviceGroup,
    targetGroup: g.targetGroup,
    groupId:     g.groupId,
    state:       g.state as ALUAState,
    targets:     g.targets,
  }))
}

export function aluaFingerprintFromDeviceGroups(deviceGroups: AluaDeviceGroup[]): string {
  return flattenAluaGroups(deviceGroups)
    .map(g => `${g.deviceGroup}/${g.targetGroup}:${g.state}`)
    .sort()
    .join('|')
}
