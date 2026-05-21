import type { FsScanError } from '~/types/filesystem'

export interface FsScannerResult<T> {
  value: T
  error?: FsScanError
}

const DEFAULT_TOOLS = {
  mkfs_xfs: false,
  mkfs_ext4: false,
  parted: false,
  fallocate: false,
  df: false,
  findmnt: false,
  blkid: false,
}

export async function runFsScanner<T>(
  scanner: string,
  fallback: T,
  fn: () => Promise<T>,
): Promise<FsScannerResult<T>> {
  try {
    return { value: await fn() }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      value: fallback,
      error: { scanner, message },
    }
  }
}

export const FS_SCANNER_FALLBACKS = {
  tools: DEFAULT_TOOLS,
  scstIndex: { pathToDevices: new Map<string, string[]>() },
  scstConfig: { handlers: [] as unknown[], drivers: [] as unknown[] },
  mounts: {
    mounts: [] as import('~/types/filesystem').FileSystemMount[],
    warnings: [] as string[],
    findmntCount: 0,
    lsblkCount: 0,
    dfCount: 0,
  },
  raid: { blockDevices: [], mdArrays: [], hardwareControllers: [] },
  lvm: { pvs: [], vgs: [], lvs: [] },
  sysfsFileio: new Map<string, Record<string, string>>(),
} as const

export function collectScannerErrors<T extends { error?: FsScanError }>(
  results: T[],
): FsScanError[] {
  return results.flatMap(r => (r.error ? [r.error] : []))
}
