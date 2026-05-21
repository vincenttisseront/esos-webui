import type { ScstConfig } from '~/types/esos'
import type { FileioDeviceRef, ScstLunMappingRef } from '~/types/filesystem'

export type ScstSysfsFileioEntry = {
  name: string
  filename: string
  attrs: Record<string, string>
}

export function collectFileioDevicesFromConfig(
  config: ScstConfig,
  mappedDeviceNames: Set<string>,
  sysfsByName?: Map<string, ScstSysfsFileioEntry>,
): FileioDeviceRef[] {
  const out: FileioDeviceRef[] = []
  const seen = new Set<string>()
  for (const h of config.handlers) {
    if (h.name !== 'vdisk_fileio') continue
    for (const d of h.devices) {
      seen.add(d.name)
      const sysfs = sysfsByName?.get(d.name)
      const attrs = { ...d.attrs, ...(sysfs?.attrs ?? {}) }
      const filename = (d.filename || sysfs?.filename || '').trim()
      out.push({
        name: d.name,
        handler: 'vdisk_fileio',
        filename,
        attrs,
        mapped: mappedDeviceNames.has(d.name),
        sysfsPresent: !!sysfs,
      })
    }
  }
  if (sysfsByName) {
    for (const [name, sysfs] of sysfsByName) {
      if (seen.has(name)) continue
      out.push({
        name,
        handler: 'vdisk_fileio',
        filename: sysfs.filename,
        attrs: sysfs.attrs,
        mapped: mappedDeviceNames.has(name),
        sysfsPresent: true,
      })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function collectLunMappingsFromConfig(config: ScstConfig): ScstLunMappingRef[] {
  const out: ScstLunMappingRef[] = []
  const deviceByName = new Map<string, { handler: string; filename: string }>()
  for (const h of config.handlers) {
    for (const d of h.devices) {
      deviceByName.set(d.name, { handler: h.name, filename: d.filename ?? '' })
    }
  }

  for (const driver of config.drivers) {
    for (const target of driver.targets) {
      for (const group of target.groups) {
        for (const lun of group.luns) {
          const dev = deviceByName.get(lun.device)
          out.push({
            targetName: target.name,
            groupName: group.name,
            lunId: lun.id,
            deviceName: lun.device,
            handler: dev?.handler ?? '',
            filename: dev?.filename ?? '',
            readOnly: !!lun.readOnly,
          })
        }
      }
      for (const lun of target.luns) {
        const dev = deviceByName.get(lun.device)
        out.push({
          targetName: target.name,
          groupName: '',
          lunId: lun.id,
          deviceName: lun.device,
          handler: dev?.handler ?? '',
          filename: dev?.filename ?? '',
          readOnly: !!lun.readOnly,
        })
      }
    }
  }

  return out.sort((a, b) =>
    a.targetName.localeCompare(b.targetName)
    || a.groupName.localeCompare(b.groupName)
    || a.lunId - b.lunId,
  )
}

export function deviceNamesMappedInLuns(lunMappings: ScstLunMappingRef[]): Set<string> {
  return new Set(lunMappings.map(l => l.deviceName))
}

export function fileioFilenamesFromDevices(devices: FileioDeviceRef[]): string[] {
  return devices.map(d => d.filename).filter(Boolean)
}
