import type { FileSystemMount, FsMountRole } from '~/types/filesystem'

/** ESOS overlay / ram mounts — not FILEIO data stores. */
export const ESOS_SYSTEM_MOUNT_POINTS = new Set([
  '/mnt/root',
  '/mnt/ram',
])

export function vdiskMountRootsFromEnv(): string[] {
  const raw = process.env.ESOS_VDISK_MOUNT_ROOTS ?? '/mnt/vdisks'
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

export function isUnderVdiskRoots(mountPoint: string, roots = vdiskMountRootsFromEnv()): boolean {
  return roots.some(r => mountPoint === r || mountPoint.startsWith(`${r}/`))
}

/**
 * Classify mount point for FILEIO workflow vs system overlay.
 */
export function classifyMountRole(
  mountPoint: string,
  options?: { fileioFilenames?: string[] },
): FsMountRole {
  if (
    mountPoint === '/'
    || mountPoint.startsWith('/proc')
    || mountPoint.startsWith('/sys')
    || ESOS_SYSTEM_MOUNT_POINTS.has(mountPoint)
  ) {
    return 'system'
  }
  if (isUnderVdiskRoots(mountPoint)) return 'fileio_data'
  const files = options?.fileioFilenames ?? []
  for (const fn of files) {
    if (fn.startsWith(`${mountPoint}/`)) return 'fileio_data'
  }
  return 'other'
}

export function fileioRelevantMounts(mounts: FileSystemMount[]): FileSystemMount[] {
  return mounts.filter(m => m.mounted && m.role === 'fileio_data')
}

export function pickPrimaryFileioMount(mounts: FileSystemMount[]): FileSystemMount | undefined {
  const relevant = fileioRelevantMounts(mounts)
  if (!relevant.length) return undefined
  return relevant.sort((a, b) => a.mountPoint.localeCompare(b.mountPoint))[0]
}

/** Normalize /dev path for alias matching. */
export function normalizeDevPath(path: string): string {
  const t = path.trim()
  if (!t) return ''
  if (t.startsWith('/dev/')) return t
  if (t.startsWith('UUID=') || t.startsWith('LABEL=')) return t
  return `/dev/${t.replace(/^\/+/, '')}`
}

export function devPathBasename(path: string): string {
  const n = normalizeDevPath(path)
  const slash = n.lastIndexOf('/')
  return slash >= 0 ? n.slice(slash + 1) : n
}
