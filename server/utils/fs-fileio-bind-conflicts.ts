import { createError } from 'h3'
import { getSanSummary } from '../db/repositories/san.repository'
import { readScstConfig } from './scst-config-reader'
import { validateScstDeviceName } from '~/utils/lvm-scst-device-ui'
import type {
  CreateFileioPayload,
  FileioBindConflict,
  FileioBindExistingMapping,
  FsOverview,
} from '~/types/filesystem'
import type { SSHSessionManager } from './ssh-session-manager'

function normalizePath(p: string): string {
  return p.trim().replace(/\/+$/, '')
}

function pathsEqual(a: string, b: string): boolean {
  const na = normalizePath(a)
  const nb = normalizePath(b)
  return na === nb || na.endsWith(nb) || nb.endsWith(na)
}

export function findFileioLunMapping(
  overview: FsOverview,
  deviceName: string,
): FileioBindExistingMapping | null {
  const lun = overview.lunMappings.find(l =>
    l.deviceName === deviceName && l.handler === 'vdisk_fileio',
  )
  if (!lun) return null
  return {
    targetName: lun.targetName,
    groupName: lun.groupName,
    lunId: lun.lunId,
  }
}

export function findFileioDeviceByFilename(overview: FsOverview, filePath: string) {
  const target = normalizePath(filePath)
  return overview.fileioDevices.find(d => pathsEqual(d.filename, target))
}

export function findFileioDeviceByName(overview: FsOverview, deviceName: string) {
  const name = deviceName.trim()
  return overview.fileioDevices.find(d => d.name === name)
}

export function detectFileioBindConflicts(
  overview: FsOverview,
  payload: CreateFileioPayload,
  options?: { sanReadOnly?: boolean },
): FileioBindConflict | null {
  if (options?.sanReadOnly) {
    return {
      code: 'san_read_only',
      message: 'SAN is read-only',
      deviceName: payload.deviceName.trim(),
      filePath: payload.vdiskPath.trim(),
    }
  }

  const deviceName = payload.deviceName.trim()
  const filePath = normalizePath(payload.vdiskPath)

  const nameErr = validateScstDeviceName(deviceName)
  if (nameErr) {
    return {
      code: 'invalid_device_name',
      message: `Invalid SCST device name (${nameErr})`,
      deviceName,
      filePath,
    }
  }

  const existingByName = findFileioDeviceByName(overview, deviceName)
  if (existingByName) {
    const existingMapping = findFileioLunMapping(overview, existingByName.name)
    return {
      code: 'device_name_exists',
      message: `SCST FILEIO device "${deviceName}" already exists`,
      deviceName,
      filePath: existingByName.filename,
      existingDeviceName: existingByName.name,
      existingMapping,
      mapped: existingByName.mapped || !!existingMapping,
    }
  }

  const existingByFile = findFileioDeviceByFilename(overview, filePath)
  if (existingByFile) {
    const existingMapping = findFileioLunMapping(overview, existingByFile.name)
    return {
      code: 'vdisk_file_already_fileio',
      message: `VDisk file is already registered as FILEIO device "${existingByFile.name}"`,
      deviceName,
      filePath,
      existingDeviceName: existingByFile.name,
      existingMapping,
      mapped: existingByFile.mapped || !!existingMapping,
    }
  }

  const vdisk = overview.vdiskFiles.find(v => pathsEqual(v.path, filePath))
  if (!vdisk) {
    return {
      code: 'vdisk_not_found',
      message: `VDisk file not found: ${filePath}`,
      deviceName,
      filePath,
    }
  }

  if (vdisk.mapped || (vdisk.scstDeviceNames?.length ?? 0) > 0) {
    const regName = vdisk.fileioDeviceName ?? vdisk.scstDeviceNames[0]
    const existingMapping = regName ? findFileioLunMapping(overview, regName) : null
    return {
      code: 'vdisk_already_mapped',
      message: 'VDisk file is already registered with SCST',
      deviceName,
      filePath,
      existingDeviceName: regName,
      existingMapping,
      mapped: true,
    }
  }

  return null
}

export async function assertScstConfigAccessible(manager: SSHSessionManager): Promise<FileioBindConflict | null> {
  try {
    await readScstConfig(manager)
    return null
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : 'SCST config unreadable'
    return {
      code: 'scst_config_unavailable',
      message: `Cannot read SCST configuration: ${detail}`,
    }
  }
}

export async function resolveFileioBindConflicts(
  manager: SSHSessionManager,
  overview: FsOverview,
  payload: CreateFileioPayload,
  sanId: string,
): Promise<FileioBindConflict | null> {
  const san = getSanSummary(sanId)
  const fromInventory = detectFileioBindConflicts(overview, payload, { sanReadOnly: !!san?.readOnly })
  if (fromInventory) return fromInventory
  return assertScstConfigAccessible(manager)
}

export function mapCreateDeviceError(
  err: unknown,
  payload: CreateFileioPayload,
  overview?: FsOverview,
): FileioBindConflict | null {
  const msg = err instanceof Error ? err.message : String(err)
  const deviceName = payload.deviceName.trim()
  const filePath = normalizePath(payload.vdiskPath)

  if (/existe déjà/i.test(msg) || /already exists/i.test(msg)) {
    if (overview) {
      const detected = detectFileioBindConflicts(overview, payload)
      if (detected) return detected
    }
    return {
      code: 'device_name_exists',
      message: msg,
      deviceName,
      filePath,
      existingDeviceName: deviceName,
      mapped: false,
    }
  }

  if (/filename|fichier|file/i.test(msg) && overview) {
    const byFile = findFileioDeviceByFilename(overview, filePath)
    if (byFile) {
      return {
        code: 'vdisk_file_already_fileio',
        message: msg,
        deviceName,
        filePath,
        existingDeviceName: byFile.name,
        mapped: byFile.mapped,
      }
    }
  }

  return null
}

export function throwFileioBindConflict(conflict: FileioBindConflict): never {
  throw createError({
    statusCode: 409,
    statusMessage: conflict.message,
    data: {
      code: conflict.code,
      conflict,
      deviceName: conflict.deviceName,
      filePath: conflict.filePath,
      existingDeviceName: conflict.existingDeviceName,
      existingMapping: conflict.existingMapping ?? null,
    },
  })
}
