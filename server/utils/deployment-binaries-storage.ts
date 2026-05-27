import { randomUUID } from 'node:crypto'
import { access, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { getDeploymentConfig } from './deployment-config'
import { scanContainerBinariesDir, isAllowedBinaryFilename } from './deployment-binaries-scan'
import { sanitizeBinaryFilename } from './deployment-binaries-fs'

import type { BinariesStorageStatusDto } from '~/types/deployment'

export type BinariesStorageStatus = BinariesStorageStatusDto

export { isAllowedBinaryFilename }

export function mapBinaryUploadFsError(err: unknown): never {
  const code = (err as NodeJS.ErrnoException).code
  if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') {
    throw createError({
      statusCode: 503,
      message: 'Le répertoire des binaires n’est pas accessible en écriture',
      data: { code: 'BINARIES_DIR_NOT_WRITABLE' },
    })
  }
  if (code === 'EEXIST') {
    throw createError({
      statusCode: 409,
      message: 'Un fichier portant ce nom existe déjà',
      data: { code: 'FILE_EXISTS' },
    })
  }
  if (code === 'ENOSPC') {
    throw createError({
      statusCode: 507,
      message: 'Espace disque insuffisant',
      data: { code: 'BINARIES_DIR_FULL' },
    })
  }
  throw err
}

async function probeWritable(dir: string): Promise<{ writable: boolean; errorCode?: string; errorMessage?: string }> {
  const probe = join(dir, `.write-probe-${randomUUID()}`)
  try {
    await writeFile(probe, 'ok', { flag: 'wx' })
    await unlink(probe)
    return { writable: true }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') {
      return {
        writable: false,
        errorCode: 'BINARIES_DIR_NOT_WRITABLE',
        errorMessage: 'Le répertoire des binaires n’est pas accessible en écriture',
      }
    }
    return {
      writable: false,
      errorCode: 'BINARIES_DIR_PROBE_FAILED',
      errorMessage: (err as Error).message ?? 'Échec du test d’écriture',
    }
  }
}

export async function getBinariesStorageStatus(): Promise<BinariesStorageStatus> {
  const { binariesDir, maxBytes } = getDeploymentConfig()
  let exists = false
  try {
    await access(binariesDir, constants.F_OK)
    exists = true
  } catch {
    exists = false
  }

  try {
    await mkdir(binariesDir, { recursive: true })
    exists = true
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    return {
      path: binariesDir,
      exists: false,
      writable: false,
      fileCount: 0,
      maxBytes,
      errorCode: code === 'EACCES' ? 'BINARIES_DIR_NOT_WRITABLE' : 'BINARIES_DIR_UNAVAILABLE',
      errorMessage: (err as Error).message ?? 'Impossible de créer le répertoire des binaires',
    }
  }

  const probe = await probeWritable(binariesDir)
  let fileCount = 0
  try {
    const files = await scanContainerBinariesDir()
    fileCount = files.length
  } catch {
    fileCount = 0
  }

  return {
    path: binariesDir,
    exists,
    writable: probe.writable,
    fileCount,
    maxBytes,
    errorCode: probe.errorCode,
    errorMessage: probe.errorMessage,
  }
}

export async function assertBinariesDirWritable(): Promise<string> {
  const status = await getBinariesStorageStatus()
  if (!status.writable) {
    throw createError({
      statusCode: 503,
      message: status.errorMessage ?? 'Le répertoire des binaires n’est pas accessible en écriture',
      data: { code: status.errorCode ?? 'BINARIES_DIR_NOT_WRITABLE', path: status.path },
    })
  }
  return status.path
}

export function validateUploadFilename(raw: string): string {
  const safe = sanitizeBinaryFilename(raw)
  if (!safe) {
    throw createError({
      statusCode: 400,
      message: 'Nom de fichier invalide',
      data: { code: 'INVALID_FILENAME' },
    })
  }
  if (!isAllowedBinaryFilename(safe)) {
    throw createError({
      statusCode: 400,
      message: 'Type de fichier non autorisé (extensions acceptées : .rpm, .tar.gz, .tgz, .tar)',
      data: { code: 'INVALID_FILE_TYPE' },
    })
  }
  return safe
}

/** Write under binariesDir using temp file + atomic rename (no overwrite). */
export async function writeBinaryFileAtomic(
  binariesDir: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  const dest = join(binariesDir, filename)
  const tmp = join(binariesDir, `.upload-${randomUUID()}.tmp`)
  try {
    await writeFile(tmp, data, { flag: 'wx' })
    await rename(tmp, dest)
    return dest
  } catch (err: unknown) {
    await unlink(tmp).catch(() => {})
    mapBinaryUploadFsError(err)
  }
}
