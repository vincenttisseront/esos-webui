import type { FileSystemMount } from '~/types/filesystem'
import { fileioRelevantMounts, isUnderVdiskRoots, vdiskMountRootsFromEnv } from '~/utils/fs-mount-classifier'

export interface PickActiveFileioMountOptions {
  /** User-selected mount in the FILEIO panel. */
  preferredMountPoint?: string | null
  /** Mount just created in the wizard (highest priority). */
  newlyCreatedMountPoint?: string | null
}

const ACTIVE_MOUNT_STORAGE_PREFIX = 'esos-fs-active-mount:'

export function activeFileioMountStorageKey(sanId: string): string {
  return `${ACTIVE_MOUNT_STORAGE_PREFIX}${sanId}`
}

export function loadPersistedActiveFileioMount(sanId: string): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    return sessionStorage.getItem(activeFileioMountStorageKey(sanId))
  } catch {
    return null
  }
}

export function persistActiveFileioMount(sanId: string, mountPoint: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(activeFileioMountStorageKey(sanId), mountPoint)
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Choose the FILEIO filesystem context for chain, next-step, and vdisk wizards.
 * Prefers explicit/new mounts, then avoids bare vdisk roots when a child mount exists,
 * then picks the mount with the most free space.
 */
export function pickActiveFileioMount(
  mounts: FileSystemMount[],
  options?: PickActiveFileioMountOptions,
): FileSystemMount | undefined {
  const relevant = fileioRelevantMounts(
    mounts.filter(m => m.mounted && (m.status === 'mounted' || m.mounted === true)),
  )
  if (!relevant.length) return undefined

  const newly = options?.newlyCreatedMountPoint?.trim()
  if (newly) {
    const hit = relevant.find(m => m.mountPoint === newly)
    if (hit) return hit
  }

  const preferred = options?.preferredMountPoint?.trim()
  if (preferred) {
    const hit = relevant.find(m => m.mountPoint === preferred)
    if (hit) return hit
  }

  const roots = vdiskMountRootsFromEnv()
  const hasChildMount = (parentMp: string) =>
    relevant.some(m => m.mountPoint !== parentMp && m.mountPoint.startsWith(`${parentMp}/`))

  const candidates = relevant.filter(m => {
    const isBareRoot = roots.some(r => m.mountPoint === r)
    if (isBareRoot && hasChildMount(m.mountPoint)) return false
    if (isBareRoot && isUnderVdiskRoots(m.mountPoint) && m.mountPoint.split('/').length <= 3) {
      return !relevant.some(other =>
        other.mountPoint !== m.mountPoint
        && other.mountPoint.startsWith(`${m.mountPoint}/`)
        && other.freeBytes > m.freeBytes,
      )
    }
    return true
  })

  const pool = candidates.length ? candidates : relevant
  return [...pool].sort((a, b) =>
    b.freeBytes - a.freeBytes
    || b.mountPoint.length - a.mountPoint.length
    || a.mountPoint.localeCompare(b.mountPoint),
  )[0]
}
