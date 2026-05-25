import type { FsFileioDetectionCounts } from '~/utils/fs-fileio-view'
import type { FileioInventory } from '~/utils/fs-fileio-inventory'

/** Summary counts from normalized FILEIO inventory (array lengths). */
export function buildFsDisplayCountsFromInventory(inventory: FileioInventory): FsFileioDetectionCounts {
  return {
    filesystems: inventory.filesystems.length,
    vdiskFiles: inventory.vdiskFiles.length,
    fileioDevices: inventory.fileioDevices.length,
    lunMappings: inventory.lunMappings.length,
  }
}
