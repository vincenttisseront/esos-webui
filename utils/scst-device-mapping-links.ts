import type { Overview } from '~/types/esos'
import type { DeviceMappingRef } from '~/types/scst-hosts'

export function findDeviceMappings(overview: Overview, deviceName: string): DeviceMappingRef[] {
  const out: DeviceMappingRef[] = []
  const needle = deviceName.trim()

  for (const target of overview.targets) {
    for (const lun of target.luns) {
      if (lun.device === needle) {
        out.push({ targetName: target.name, groupName: '', lunId: lun.id })
      }
    }
    for (const group of target.groups) {
      for (const lun of group.luns) {
        if (lun.device === needle) {
          out.push({ targetName: target.name, groupName: group.name, lunId: lun.id })
        }
      }
    }
  }

  return out.sort((a, b) =>
    a.targetName.localeCompare(b.targetName)
    || a.groupName.localeCompare(b.groupName)
    || a.lunId - b.lunId,
  )
}

export function targetDetailPath(targetName: string, query?: Record<string, string>): string {
  const base = `/targets/${encodeURIComponent(targetName)}`
  if (!query || !Object.keys(query).length) return base
  const params = new URLSearchParams(query)
  return `${base}?${params.toString()}`
}

/** Primary link for viewing mappings; null when no mappings. */
export function primaryMappingViewUrl(mappings: DeviceMappingRef[]): string | null {
  if (mappings.length === 0) return null
  return targetDetailPath(mappings[0].targetName)
}

/** Expose flow for unmapped device on first target (writable SAN only). */
export function exposeDeviceUrl(overview: Overview, deviceName: string): string | null {
  const firstTarget = overview.targets[0]?.name
  if (!firstTarget) return null
  return targetDetailPath(firstTarget, { exposeDevice: deviceName })
}
