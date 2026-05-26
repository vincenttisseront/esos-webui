import type { LogicalVolume } from '~/types/lvm'
import { lvCanBindScst } from '~/utils/lvm-action-availability'

export type LvFileioUsage = 'scst_blockio' | 'available' | 'fileio_backend' | 'unknown'

export interface LvUsageView {
  usage: LvFileioUsage
  labelKey: string
  badgeColor: 'green' | 'amber' | 'blue' | 'gray'
}

function pathMatchesEligible(lv: LogicalVolume, paths: string[]): boolean {
  return paths.some(p =>
    p === lv.path
    || lv.pathCandidates?.includes(p)
    || p.endsWith(`/${lv.vgName}/${lv.name}`)
    || lv.path.endsWith(p),
  )
}

export function classifyLvFileioUsage(
  lv: LogicalVolume,
  opts?: { fileioEligiblePaths?: string[] },
): LvUsageView {
  const eligiblePaths = opts?.fileioEligiblePaths ?? []
  if (eligiblePaths.length && pathMatchesEligible(lv, eligiblePaths)) {
    return {
      usage: 'fileio_backend',
      labelKey: 'storage.workflow.lv_usage.fileio_backend',
      badgeColor: 'blue',
    }
  }

  const scstNames = lv.scst?.deviceNames ?? lv.scstDeviceNames ?? []
  const scstBound = scstNames.length > 0 || lv.usedBy.includes('scst') || !lvCanBindScst(lv)
  if (scstBound) {
    return {
      usage: 'scst_blockio',
      labelKey: 'storage.workflow.lv_usage.scst_blockio',
      badgeColor: 'amber',
    }
  }

  if (lvCanBindScst(lv)) {
    return {
      usage: 'available',
      labelKey: 'storage.workflow.lv_usage.available',
      badgeColor: 'green',
    }
  }

  return {
    usage: 'unknown',
    labelKey: 'storage.workflow.lv_usage.unknown',
    badgeColor: 'gray',
  }
}

export function isBlockProvisioningComplete(lvs: LogicalVolume[]): boolean {
  return lvs.length > 0 && lvs.every(lv => !lvCanBindScst(lv))
}
