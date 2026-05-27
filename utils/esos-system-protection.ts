/**
 * Shared ESOS system-protection shapes (client + server).
 */
import type { EsosProtectionReason } from '~/types/raid'

export interface EsosProtectedDeviceDiagnostic {
  protectedDevice: string
  reasons: EsosProtectionReason[]
  labelsFound: string[]
  mountedPaths: string[]
  relatedBlockPaths: string[]
  hardwareLogicalDriveIds: string[]
}

export interface EsosSystemProtectionOverview {
  protectedDevices: EsosProtectedDeviceDiagnostic[]
  warnings: string[]
  errors: string[]
  protectedBlockPaths: string[]
  protectedDiskPaths: string[]
  protectedHardwareLdIds: string[]
  duplicateEsosLabels: boolean
}

export function emptyEsosSystemProtection(): EsosSystemProtectionOverview {
  return {
    protectedDevices: [],
    warnings: [],
    errors: [],
    protectedBlockPaths: [],
    protectedDiskPaths: [],
    protectedHardwareLdIds: [],
    duplicateEsosLabels: false,
  }
}

export function normalizeEsosSystemProtection(
  value?: EsosSystemProtectionOverview | null,
): EsosSystemProtectionOverview {
  if (!value) return emptyEsosSystemProtection()
  return {
    protectedDevices: value.protectedDevices ?? [],
    warnings: value.warnings ?? [],
    errors: value.errors ?? [],
    protectedBlockPaths: value.protectedBlockPaths ?? [],
    protectedDiskPaths: value.protectedDiskPaths ?? [],
    protectedHardwareLdIds: value.protectedHardwareLdIds ?? [],
    duplicateEsosLabels: value.duplicateEsosLabels ?? false,
  }
}
