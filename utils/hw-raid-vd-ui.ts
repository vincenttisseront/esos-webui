import type { HardwareRaidLogicalDrive } from '~/types/raid'

export function vdNeedsOsRescan(ld: HardwareRaidLogicalDrive): boolean {
  return !Boolean(ld.osDevicePath?.trim() || ld.devicePath?.trim())
}

export function vdDeviceText(ld: HardwareRaidLogicalDrive, notDetectedLabel: string): string {
  return ld.osDevicePath?.trim() || ld.devicePath?.trim() || notDetectedLabel
}
