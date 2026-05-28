import type { HardwareRaidController, RaidToolsInfo } from '~/types/raid'
import { hwLdOsPath } from '~/utils/hw-raid-backend-eligibility'

export interface HwRaidBackendStatus {
  controllerDetected: boolean
  osDeviceDetected: boolean
  osPath?: string
  pendingRescan: boolean
}

export interface PendingHwRaidBackend {
  controllerId: string
  controllerLabel: string
  vdId: string
  sizeBytes: number
  status: HwRaidBackendStatus
  reasons: string[]
}

function hwLdUnmappedReasonKeyLocal(tools: RaidToolsInfo): string {
  return (tools.perccli || tools.storcli || tools.MegaCli64)
    ? 'storage.fs.hw_ld.mapping_not_found'
    : 'storage.fs.hw_ld.tool_missing'
}

export function collectPendingHwRaidBackends(
  controllers: HardwareRaidController[],
  tools?: RaidToolsInfo,
): PendingHwRaidBackend[] {
  const pending: PendingHwRaidBackend[] = []
  const toolState: RaidToolsInfo = tools ?? {
    mdadm: false,
    lspci: false,
    storcli: false,
    perccli: false,
    MegaCli64: false,
    arcconf: false,
    lsscsi: false,
    wipefs: false,
    parted: false,
    sfdisk: false,
    fdisk: false,
    partprobe: false,
    udevadm: false,
  }
  for (const ctrl of controllers) {
    for (const ld of ctrl.logicalDrives) {
      if (ld.state !== 'optimal' && ld.state !== 'degraded') continue
      const osPath = hwLdOsPath(ld) ?? undefined
      if (osPath) continue
      pending.push({
        controllerId: ctrl.id,
        controllerLabel: ctrl.model || ctrl.id,
        vdId: ld.id,
        sizeBytes: ld.sizeBytes ?? 0,
        status: {
          controllerDetected: true,
          osDeviceDetected: false,
          pendingRescan: true,
        },
        reasons: [hwLdUnmappedReasonKeyLocal(toolState)],
      })
    }
  }
  return pending
}
