import type {
  FileioDeviceRef,
  FileSystemMount,
  FsOverview,
  ScstLunMappingRef,
  VDiskFile,
} from '~/types/filesystem'
import { buildFsProvisioningSteps } from '~/utils/fs-provisioning-chain'
import { buildFsDisplayCounts } from '~/utils/fs-display-counts'
import { fileioRelevantMounts } from '~/utils/fs-mount-classifier'
import type { ProvisioningStepView } from '~/utils/lvm-provisioning-chain'

export interface FsFileioDetectionCounts {
  filesystems: number
  vdiskFiles: number
  fileioDevices: number
  lunMappings: number
}

/** Single normalized FILEIO view shared by chain and detail tables. */
export interface FsFileioViewModel {
  filesystems: FileSystemMount[]
  vdiskFiles: VDiskFile[]
  fileioDevices: FileioDeviceRef[]
  lunMappings: ScstLunMappingRef[]
  chain: ProvisioningStepView[]
  counts: FsFileioDetectionCounts
}

export function buildFsFileioViewModel(overview: FsOverview | null): FsFileioViewModel | null {
  if (!overview) return null

  const filesystems = fileioRelevantMounts(overview.mounts)
  const { vdiskFiles, fileioDevices, lunMappings } = overview

  return {
    filesystems,
    vdiskFiles,
    fileioDevices,
    lunMappings,
    chain: buildFsProvisioningSteps(overview),
    counts: buildFsDisplayCounts(overview),
  }
}

/** True when chain step detail is present in the matching inventory list. */
export function chainDetailInInventory(
  view: FsFileioViewModel,
  stepId: 'filesystem' | 'vdisk' | 'fileio' | 'expose',
): boolean {
  const step = view.chain.find(s => s.id === stepId)
  const detail = step?.detail?.trim()
  if (!detail || detail === '—') return true

  switch (stepId) {
    case 'filesystem':
      return view.filesystems.some(m => m.mountPoint === detail || detail.startsWith(m.mountPoint))
    case 'vdisk':
      return view.vdiskFiles.some(v => v.fileName === detail || v.path === detail || detail.includes(v.fileName))
    case 'fileio':
      return view.fileioDevices.some(d => d.name === detail)
    case 'expose': {
      const lunMatch = detail.match(/LUN\s+(\d+)/i)
      const lunId = lunMatch ? Number(lunMatch[1]) : undefined
      const targetPrefix = detail.split(/\s+LUN\s/i)[0]?.trim()
      return view.lunMappings.some(l =>
        (lunId === undefined || l.lunId === lunId)
        && (!targetPrefix || l.targetName === targetPrefix || detail.startsWith(l.targetName)),
      )
    }
    default:
      return true
  }
}
