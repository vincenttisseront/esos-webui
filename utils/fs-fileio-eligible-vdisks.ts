import type { FsOverview, VDiskFile } from '~/types/filesystem'
import { findFileioRegistrationForPath } from '~/utils/fs-fileio-bind-conflict'
import { isFilePathEsosProtected } from '~/utils/esos-resource-protection'

export type FileioOverviewSlice = Pick<FsOverview, 'fileioDevices'> | null | undefined

/** Vdisk path is not already a SCST FILEIO device and not SCST-mapped elsewhere. */
export function isVdiskEligibleForFileioBind(
  vdisk: VDiskFile,
  overview: FileioOverviewSlice & Pick<FsOverview, 'systemProtection'> | null | undefined,
): boolean {
  if (findFileioRegistrationForPath(overview, vdisk.path)) return false
  if (vdisk.mapped) return false
  if ((vdisk.scstDeviceNames?.length ?? 0) > 0) return false
  if (isFilePathEsosProtected(vdisk.path, overview?.systemProtection)) return false
  return true
}

export function eligibleVdisksForFileioBind(
  vdiskFiles: VDiskFile[],
  overview: FileioOverviewSlice,
): VDiskFile[] {
  return vdiskFiles.filter(v => isVdiskEligibleForFileioBind(v, overview))
}

export function hasEligibleVdisksForFileioBind(
  vdiskFiles: VDiskFile[],
  overview: FileioOverviewSlice,
): boolean {
  return eligibleVdisksForFileioBind(vdiskFiles, overview).length > 0
}
