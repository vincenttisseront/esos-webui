import type { HardwareRaidLogicalDrive } from '~/types/raid'

export function vdNeedsOsRescan(ld: HardwareRaidLogicalDrive): boolean {
  return !Boolean(ld.devicePath?.trim())
}

export function vdDeviceText(ld: HardwareRaidLogicalDrive, notDetectedLabel: string): string {
  return ld.devicePath?.trim() || notDetectedLabel
}
