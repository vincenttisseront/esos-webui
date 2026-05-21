import type { UpgradePackageStatus } from '~/types/upgrade'

const _status = new Map<string, UpgradePackageStatus>()

export function setUpgradePackageStatus(status: UpgradePackageStatus): void {
  _status.set(status.stagingId, status)
  if (status.sanId) {
    for (const [k, v] of _status) {
      if (k !== status.stagingId && v.sanId === status.sanId) _status.delete(k)
    }
  }
}

export function getUpgradePackageStatus(stagingId: string): UpgradePackageStatus | undefined {
  return _status.get(stagingId)
}

export function getUpgradePackageStatusBySan(sanId: string): UpgradePackageStatus | undefined {
  for (const v of _status.values()) {
    if (v.sanId === sanId) return v
  }
  return undefined
}

export function deleteUpgradePackageStatus(stagingId: string): void {
  _status.delete(stagingId)
}
