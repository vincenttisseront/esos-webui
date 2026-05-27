import type { HardwareRaidController } from '~/types/raid'

export type HwRaidCreateIneligibilityReason =
  | 'cli_missing'
  | 'cli_test_failed'
  | 'no_free_disks'
  | 'create_not_supported'
  | 'san_read_only'
  | 'read_only_limited'

export interface HwRaidCreateEligibility {
  controllerId: string
  eligible: boolean
  reasons: HwRaidCreateIneligibilityReason[]
  freeDiskCount: number
  physicalDiskCount: number
  logicalDriveCount: number
}

export function countFreeHwRaidDisks(controller: HardwareRaidController): number {
  return controller.physicalDrives.filter(d => d.eligible).length
}

export function assessHwRaidCreateEligibility(
  controller: HardwareRaidController,
  options?: {
    sanReadOnly?: boolean
    cliValidated?: boolean
  },
): HwRaidCreateEligibility {
  const reasons: HwRaidCreateIneligibilityReason[] = []
  const freeDiskCount = countFreeHwRaidDisks(controller)
  const physicalDiskCount = controller.physicalDrives.length
  const logicalDriveCount = controller.logicalDrives.length

  if (options?.sanReadOnly) {
    reasons.push('san_read_only')
  }

  if (controller.managementMode === 'read_only_limited') {
    reasons.push('read_only_limited')
    if (controller.cliTool === 'none') {
      reasons.push('cli_missing')
    }
  }

  if (controller.cliTool === 'none' && !reasons.includes('cli_missing')) {
    reasons.push('cli_missing')
  }

  if (options?.cliValidated === false) {
    reasons.push('cli_test_failed')
  }

  if (controller.managementMode === 'full') {
    if (controller.cliTool === 'arcconf' || controller.cliTool === 'MegaCli64') {
      reasons.push('create_not_supported')
    }
    if (freeDiskCount === 0 && physicalDiskCount > 0) {
      reasons.push('no_free_disks')
    }
    if (physicalDiskCount === 0 && !reasons.includes('cli_missing') && !reasons.includes('cli_test_failed')) {
      reasons.push('no_free_disks')
    }
  }

  const eligible = reasons.length === 0
    && controller.managementMode === 'full'
    && controller.supportsCreate
    && freeDiskCount > 0

  return {
    controllerId: controller.id,
    eligible,
    reasons,
    freeDiskCount,
    physicalDiskCount,
    logicalDriveCount,
  }
}

export function assessAllHwRaidCreateEligibility(
  controllers: HardwareRaidController[],
  options?: { sanReadOnly?: boolean; cliValidated?: boolean },
): HwRaidCreateEligibility[] {
  return controllers.map(c => assessHwRaidCreateEligibility(c, options))
}
