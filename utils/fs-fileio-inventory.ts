import type {
  FileioDeviceRef,
  FileSystemMount,
  FsBackendRef,
  FsOverview,
  ScstLunMappingRef,
  VDiskFile,
} from '~/types/filesystem'
import { fileioRelevantMounts } from '~/utils/fs-mount-classifier'

export interface FileioInventory {
  filesystems: FileSystemMount[]
  vdiskFiles: VDiskFile[]
  fileioDevices: FileioDeviceRef[]
  lunMappings: ScstLunMappingRef[]
  backendCandidates: FsBackendRef[]
}

/** FILEIO-scoped inventory slices shared by chain, tables, and counts. */
export function extractFileioInventory(overview: FsOverview): FileioInventory {
  const fileioDevices = overview.fileioDevices
  const fileioDeviceNames = new Set(fileioDevices.map(d => d.name))
  const lunMappings = overview.lunMappings.filter(l =>
    l.handler === 'vdisk_fileio' || fileioDeviceNames.has(l.deviceName),
  )

  return {
    filesystems: fileioRelevantMounts(overview.mounts),
    vdiskFiles: overview.vdiskFiles,
    fileioDevices,
    lunMappings,
    backendCandidates: overview.backends,
  }
}

export function collectFileioWarnings(overview: FsOverview): string[] {
  const out: string[] = []
  for (const w of overview.scanWarnings ?? []) {
    if (w && !out.includes(w)) out.push(w)
  }
  for (const w of overview.diagnostics?.warnings ?? []) {
    if (w && !out.includes(w)) out.push(w)
  }
  for (const w of overview.warnings ?? []) {
    if (w && !out.includes(w)) out.push(w)
  }
  for (const e of overview.errors ?? []) {
    const msg = e.message ? `${e.scanner}: ${e.message}` : e.scanner
    if (msg && !out.includes(msg)) out.push(msg)
  }
  return out
}
