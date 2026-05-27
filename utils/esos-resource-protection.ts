/**
 * Shared ESOS system resource guards (mounts, files, block paths).
 */
import { ESOS_SYSTEM_MOUNT_POINTS } from '~/utils/fs-mount-classifier'
import type { EsosSystemProtectionOverview } from '~/utils/esos-system-protection'

export const ESOS_SQUASH_ROOT_FILE_PATHS = [
  '/mnt/root/PRIMARY-root.sqsh',
  '/mnt/root/SECONDARY-root.sqsh',
] as const

export const ESOS_SQUASH_ROOT_BASENAMES = new Set([
  'PRIMARY-root.sqsh',
  'SECONDARY-root.sqsh',
])

export function isEsosProtectionDetectionFailed(
  snapshot?: EsosSystemProtectionOverview | null,
): boolean {
  if (!snapshot) return false
  return snapshot.detectionFailed === true || (snapshot.errors?.length ?? 0) > 0
}

export function isMountPointEsosProtected(
  mountPoint: string,
  snapshot?: EsosSystemProtectionOverview | null,
): boolean {
  const mp = mountPoint.trim()
  if (!mp) return false
  if (mp === '/' || ESOS_SYSTEM_MOUNT_POINTS.has(mp)) return true
  if (snapshot?.protectedMountPoints?.includes(mp)) return true
  return false
}

export function isFilePathEsosProtected(
  filePath: string,
  snapshot?: EsosSystemProtectionOverview | null,
): boolean {
  const path = filePath.trim()
  if (!path) return false
  if (snapshot?.protectedFilePaths?.some(p => path === p || path.startsWith(`${p}/`))) {
    return true
  }
  for (const fixed of ESOS_SQUASH_ROOT_FILE_PATHS) {
    if (path === fixed || path.startsWith(`${fixed}/`)) return true
  }
  const base = path.split('/').pop() ?? ''
  if (ESOS_SQUASH_ROOT_BASENAMES.has(base)) return true
  if (path.includes('/mnt/root/') && base.endsWith('.sqsh')) return true
  return false
}

export function esosProtectedMountBlocker(mountPoint: string): string {
  return `Point de montage protégé (volume système ESOS) : ${mountPoint}`
}

export function esosProtectedFileBlocker(filePath: string): string {
  return `Fichier protégé (volume système ESOS) : ${filePath}`
}

export function esosProtectionDetectionFailedBlocker(): string {
  return 'Détection des volumes système ESOS indisponible — action destructive refusée par sécurité'
}
