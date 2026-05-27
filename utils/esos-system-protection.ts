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
  protectedMountPoints: string[]
  protectedFilePaths: string[]
  duplicateEsosLabels: boolean
  /** True when detection threw or returned errors — destructive actions must fail closed. */
  detectionFailed?: boolean
}

export function emptyEsosSystemProtection(): EsosSystemProtectionOverview {
  return {
    protectedDevices: [],
    warnings: [],
    errors: [],
    protectedBlockPaths: [],
    protectedDiskPaths: [],
    protectedHardwareLdIds: [],
    protectedMountPoints: [],
    protectedFilePaths: [],
    duplicateEsosLabels: false,
    detectionFailed: false,
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
    protectedMountPoints: value.protectedMountPoints ?? [],
    protectedFilePaths: value.protectedFilePaths ?? [],
    duplicateEsosLabels: value.duplicateEsosLabels ?? false,
    detectionFailed: value.detectionFailed ?? false,
  }
}

/** @alias Primary entry point for ESOS system resource detection (server implements details). */
export type DetectSystemProtectedResourcesResult = EsosSystemProtectionOverview
