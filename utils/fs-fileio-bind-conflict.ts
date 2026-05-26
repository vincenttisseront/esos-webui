import type { FileioBindConflict, FileioBindConflictCode } from '~/types/filesystem'
import type { DeviceMappingRef } from '~/types/scst-hosts'
import { findDeviceMappings, exposeDeviceUrl, primaryMappingViewUrl } from '~/utils/scst-device-mapping-links'
import type { Overview } from '~/types/esos'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

type ApiErrorLike = {
  statusCode?: number
  status?: number
  statusMessage?: string
  message?: string
  data?: {
    conflict?: FileioBindConflict
    code?: FileioBindConflictCode
    deviceName?: string
    filePath?: string
    existingDeviceName?: string
    existingMapping?: FileioBindConflict['existingMapping']
    mapped?: boolean
  }
}

export function parseFileioBindConflictFromError(e: unknown): FileioBindConflict | null {
  const err = e as ApiErrorLike
  if (err?.data?.conflict) return err.data.conflict

  const code = err?.data?.code
  if (!code) return null

  return {
    code,
    message: err.statusMessage ?? err.message ?? 'Conflict',
    deviceName: err.data?.deviceName,
    filePath: err.data?.filePath,
    existingDeviceName: err.data?.existingDeviceName,
    existingMapping: err.data?.existingMapping ?? null,
    mapped: err.data?.mapped,
  }
}

export function fileioConflictMessageKey(code: FileioBindConflictCode): string {
  return `storage.fs.wizard.fileio.conflict.${code}`
}

export function formatFileioBindConflictMessage(
  conflict: FileioBindConflict,
  t: TranslateFn,
): string {
  const key = fileioConflictMessageKey(conflict.code)
  const params: Record<string, unknown> = {
    deviceName: conflict.deviceName ?? conflict.existingDeviceName ?? '—',
    filePath: conflict.filePath ?? '—',
    existingDeviceName: conflict.existingDeviceName ?? '—',
  }
  const translated = t(key, params)
  if (translated !== key) return translated
  return conflict.message
}

export function fileioConflictBlocksCreate(conflict: FileioBindConflict | null): boolean {
  if (!conflict) return false
  return conflict.code === 'device_name_exists'
    || conflict.code === 'vdisk_file_already_fileio'
    || conflict.code === 'vdisk_already_mapped'
}

export function fileioConflictAllowsNameRetry(conflict: FileioBindConflict | null): boolean {
  return conflict?.code === 'device_name_exists'
}

export interface FileioConflictActions {
  viewMappingsUrl: string | null
  exposeLunUrl: string | null
  existingDeviceName: string | null
}

export function findFileioRegistrationForPath(
  overview: { fileioDevices: Array<{ name: string; filename: string; mapped: boolean }> } | null | undefined,
  filePath: string,
) {
  if (!overview) return null
  const target = filePath.trim().replace(/\/+$/, '')
  const dev = overview.fileioDevices.find(d => {
    const f = d.filename.trim().replace(/\/+$/, '')
    return f === target || f.endsWith(target) || target.endsWith(f)
  })
  if (!dev) return null
  return { deviceName: dev.name, filename: dev.filename, mapped: dev.mapped }
}

export function fileioConflictActions(
  conflict: FileioBindConflict | null,
  overview: Overview | null | undefined,
): FileioConflictActions {
  const name = conflict?.existingDeviceName ?? conflict?.deviceName
  if (!name || !overview) {
    return { viewMappingsUrl: null, exposeLunUrl: null, existingDeviceName: name ?? null }
  }
  const mappings: DeviceMappingRef[] = conflict?.existingMapping
    ? [{
        targetName: conflict.existingMapping.targetName,
        groupName: conflict.existingMapping.groupName,
        lunId: conflict.existingMapping.lunId,
      }]
    : findDeviceMappings(overview, name)

  return {
    viewMappingsUrl: primaryMappingViewUrl(mappings),
    exposeLunUrl: mappings.length ? null : exposeDeviceUrl(overview, name),
    existingDeviceName: name,
  }
}
