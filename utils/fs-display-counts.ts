import type { FsFileioDetectionCounts } from '~/utils/fs-fileio-view'
import type { FsOverview } from '~/types/filesystem'
import { fileioRelevantMounts } from '~/utils/fs-mount-classifier'

/** Summary counts: never under-report when arrays or diagnostics disagree. */
export function buildFsDisplayCounts(overview: FsOverview): FsFileioDetectionCounts {
  const filesystems = fileioRelevantMounts(overview.mounts)
  const d = overview.diagnostics

  return {
    filesystems: Math.max(
      filesystems.length,
      d?.mountCounts?.fileioData ?? 0,
    ),
    vdiskFiles: Math.max(
      overview.vdiskFiles.length,
      d?.vdiskFiles ?? 0,
    ),
    fileioDevices: Math.max(
      overview.fileioDevices.length,
      d?.scst?.fileioDevices ?? 0,
    ),
    lunMappings: Math.max(
      overview.lunMappings.length,
      d?.scst?.lunMappings ?? 0,
    ),
  }
}
