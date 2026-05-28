import type {
  FileioDeviceRef,
  FileSystemMount,
  FsBackendRef,
  FsDetectionDiagnostics,
  FsOverview,
  FsScanError,
  ScstLunMappingRef,
  VDiskFile,
} from '~/types/filesystem'
import { buildFsProvisioningSteps } from '~/utils/fs-provisioning-chain'
import { buildFsDisplayCountsFromInventory } from '~/utils/fs-display-counts'
import { collectFileioWarnings, extractFileioInventory } from '~/utils/fs-fileio-inventory'
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
  backendCandidates: FsBackendRef[]
  chain: ProvisioningStepView[]
  counts: FsFileioDetectionCounts
  diagnostics: FsDetectionDiagnostics | null
  warnings: string[]
  partial: boolean
  errors?: FsScanError[]
}

export function buildFsFileioViewModel(
  overview: FsOverview | null,
  options?: { activeMountPoint?: string | null },
): FsFileioViewModel | null {
  if (!overview) return null

  const inventory = extractFileioInventory(overview)

  return {
    ...inventory,
    chain: buildFsProvisioningSteps(overview, inventory, options),
    counts: buildFsDisplayCountsFromInventory(inventory),
    diagnostics: overview.diagnostics ?? null,
    warnings: collectFileioWarnings(overview),
    partial: Boolean(overview.partial),
    errors: overview.errors,
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

  if (step?.detailKey?.includes('.vdisk_multiple') || step?.detailKey?.includes('.fileio_')
    || step?.detailKey?.includes('.expose_')) {
    const count = step.count ?? 0
    if (stepId === 'vdisk') return count === 0 || view.vdiskFiles.length >= count
    if (stepId === 'fileio') return count === 0 || view.fileioDevices.length >= count
    if (stepId === 'expose') return view.lunMappings.length >= 0
  }

  switch (stepId) {
    case 'filesystem':
      return view.filesystems.some(m => m.mountPoint === detail || detail.startsWith(m.mountPoint))
    case 'vdisk':
      return view.vdiskFiles.some(v => v.fileName === detail || v.path === detail || detail.includes(v.fileName))
    case 'fileio':
      return view.fileioDevices.some(d => d.name === detail)
        || detail.toLowerCase().includes('device')
        || detail.toLowerCase().includes('enregistr')
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
