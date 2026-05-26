import type { AluaDeviceGroupConfig, ScstConfig } from '~/types/esos'
import { isSystemDriver } from '~/types/esos'
import { serializeScstConfig } from './scst-config-writer'

export function listScstDeviceNames(config: ScstConfig): string[] {
  const names = new Set<string>()
  for (const h of config.handlers) {
    for (const d of h.devices) names.add(d.name)
  }
  return [...names].sort()
}

export function listScstTargetNames(config: ScstConfig): string[] {
  const names = new Set<string>()
  for (const d of config.drivers) {
    if (isSystemDriver(d.name)) continue
    for (const t of d.targets) names.add(t.name)
  }
  return [...names].sort()
}

export function targetExistsOnConfig(config: ScstConfig, targetName: string): boolean {
  return listScstTargetNames(config).includes(targetName)
}

export function findTargetInOtherDeviceGroups(
  config: ScstConfig,
  targetName: string,
  exceptGroupName?: string,
): string | null {
  for (const dg of config.deviceGroups ?? []) {
    if (exceptGroupName && dg.name === exceptGroupName) continue
    for (const tg of dg.targetGroups) {
      if (tg.targets.includes(targetName)) return dg.name
    }
  }
  return null
}

export function upsertDeviceGroup(
  config: ScstConfig,
  dg: AluaDeviceGroupConfig,
  mode: 'create' | 'replace',
): void {
  if (!config.deviceGroups) config.deviceGroups = []
  const idx = config.deviceGroups.findIndex(g => g.name === dg.name)
  if (idx === -1) {
    config.deviceGroups.push(structuredClone(dg))
    return
  }
  if (mode !== 'replace') {
    throw new Error(`DEVICE_GROUP "${dg.name}" existe déjà`)
  }
  config.deviceGroups[idx] = structuredClone(dg)
}

export function serializeConfig(config: ScstConfig): string {
  return serializeScstConfig(config)
}

/** Build sysfs-shaped device groups from conf for comparison preview. */
export function deviceGroupConfigToSnapshot(dg: AluaDeviceGroupConfig) {
  return {
    name:    dg.name,
    devices: [...dg.devices],
    targetGroups: dg.targetGroups.map(tg => ({
      name:    tg.name,
      groupId: tg.groupId,
      state:   'unknown' as const,
      role:    tg.name === 'local' ? 'local' as const : tg.name === 'remote' ? 'remote' as const : 'unknown' as const,
      targets: tg.targets.map(targetName => ({ targetName })),
    })),
  }
}
