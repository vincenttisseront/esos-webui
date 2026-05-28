import type { FsType, PartitionStrategy } from '~/types/filesystem'

const MOUNT_POINT_RE = /^\/[a-zA-Z0-9][a-zA-Z0-9_./-]*$/
const LABEL_RE = /^[a-zA-Z0-9._-]{1,32}$/
const DEVICE_PATH_RE = /^\/dev\/[a-zA-Z0-9_./-]+$/
const BLOCKED_MOUNT_PREFIXES = ['/boot', '/etc', '/proc', '/sys', '/dev', '/run', '/var/run', '/mnt/root']

/** @deprecated Use {@link expectedCreateFilesystemConfirmation} */
export function expectedFormatFsConfirmation(backendPath: string): string {
  return `FORMAT ${backendPath}`
}

export function expectedCreateFilesystemConfirmation(mountPoint: string): string {
  return `CREATE FILESYSTEM ${mountPoint.trim()}`
}

export function validateMountPoint(mountPoint: string): string | null {
  const mp = mountPoint.trim()
  if (!mp || mp === '/') return 'storage.fs.errors.mount_point_invalid'
  if (!MOUNT_POINT_RE.test(mp)) return 'storage.fs.errors.mount_point_invalid'
  if (BLOCKED_MOUNT_PREFIXES.some(p => mp === p || mp.startsWith(`${p}/`))) {
    return 'storage.fs.errors.mount_point_system'
  }
  return null
}

export function validateFsLabel(label: string): string | null {
  const v = label.trim()
  if (!v) return 'storage.fs.errors.label_required'
  if (!LABEL_RE.test(v)) return 'storage.fs.errors.label_invalid'
  return null
}

export function validateBackendPath(path: string): string | null {
  const p = path.trim()
  if (!DEVICE_PATH_RE.test(p)) return 'storage.fs.errors.backend_invalid'
  return null
}

export function validateFsType(fsType: string): fsType is FsType {
  return fsType === 'xfs' || fsType === 'ext4'
}

export function validateVdiskFileName(fileName: string): string | null {
  const n = fileName.trim()
  if (!n || n.includes('/') || n.includes('..')) return 'storage.fs.errors.vdisk_name_invalid'
  if (!/^[a-zA-Z0-9._-]+$/.test(n)) return 'storage.fs.errors.vdisk_name_invalid'
  return null
}

export function validateVdiskSize(sizeBytes: number, freeBytes: number): string | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1024 * 1024) {
    return 'storage.fs.errors.vdisk_size_min'
  }
  if (sizeBytes > freeBytes * 0.95) return 'storage.fs.errors.vdisk_size_free'
  return null
}

export interface CreateFsValidationInput {
  backendPath: string
  fsType: FsType
  label: string
  mountPoint: string
  partitionStrategy?: PartitionStrategy
  blockers?: string[]
}

export function validateCreateFsInput(input: CreateFsValidationInput): {
  ok: boolean
  errorKey?: string
  blockers: string[]
} {
  const blockers = [...(input.blockers ?? [])]
  const keys = [
    validateBackendPath(input.backendPath),
    validateMountPoint(input.mountPoint),
    validateFsLabel(input.label),
    !validateFsType(input.fsType) ? 'storage.fs.errors.fs_type_invalid' : null,
  ].filter(Boolean) as string[]

  blockers.push(...keys.map(k => k))
  return { ok: blockers.length === 0, errorKey: keys[0], blockers }
}
