import type { Device, Overview, Target } from '~/types/esos'
import type { UnmappedDeviceInfo } from '~/types/scst-hosts'

function mappedDeviceNamesFromTarget(target: Target): Set<string> {
  const names = new Set<string>()
  for (const lun of target.luns) names.add(lun.device)
  for (const g of target.groups) {
    for (const lun of g.luns) names.add(lun.device)
  }
  return names
}

/** Device names referenced by any LUN on any target in the overview. */
export function globalMappedDeviceNames(overview: Overview): Set<string> {
  const names = new Set<string>()
  for (const t of [...overview.targets, ...overview.systemTargets]) {
    for (const n of mappedDeviceNamesFromTarget(t)) names.add(n)
  }
  return names
}

export function unmappedDevicesFromOverview(overview: Overview): UnmappedDeviceInfo[] {
  const mapped = globalMappedDeviceNames(overview)
  return overview.devices
    .filter(d => !mapped.has(d.name))
    .map((d): UnmappedDeviceInfo => ({
      name: d.name,
      handler: d.handler,
      filename: d.filename,
    }))
}

/** Unmapped devices for a single target context (same global pool — SCST devices are cluster-wide in conf). */
export function unmappedDevicesForTarget(overview: Overview, _targetName: string): UnmappedDeviceInfo[] {
  return unmappedDevicesFromOverview(overview)
}

export function deviceUsageByTarget(overview: Overview, deviceName: string): string[] {
  const targets: string[] = []
  for (const t of overview.targets) {
    if (mappedDeviceNamesFromTarget(t).has(deviceName)) targets.push(t.name)
  }
  return targets
}

export function isDeviceMapped(overview: Overview, deviceName: string): boolean {
  return globalMappedDeviceNames(overview).has(deviceName)
}
