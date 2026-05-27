import { randomUUID } from 'node:crypto'
import { unlink, stat } from 'node:fs/promises'
import type { ContainerBinaryEntry, DeploymentBinaryDto } from '~/types/deployment'
import { computeFileSha256 } from './deployment-binaries-catalog'
import {
  inferBinaryKind,
  inferBinaryName,
  scanContainerBinariesDir,
} from './deployment-binaries-scan'
import {
  deleteContainerFileByRelative,
  relativePathFromBinary,
  resolveContainerFilePath,
} from './deployment-binaries-fs'
import {
  assertBinariesDirWritable,
  validateUploadFilename,
  writeBinaryFileAtomic,
} from './deployment-binaries-storage'
import { loadInstallSpecForFile } from './deployment-binaries-register'
import {
  deleteDeploymentBinary,
  getBinaryBySha256,
  getDeploymentBinaryById,
  insertDeploymentBinary,
  listDeploymentBinaries,
  updateDeploymentBinary,
} from '../db/repositories/deployment.repository'
import { getDeploymentConfig } from './deployment-config'

export type ContainerBinaryListItem = ContainerBinaryEntry & {
  sha256: string | null
  registered: boolean
  catalogId: string | null
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const st = await stat(path)
    return st.isFile()
  } catch {
    return false
  }
}

export async function resolveBinaryLocalPath(binary: DeploymentBinaryDto): Promise<string | null> {
  if (binary.storedPath && await fileExists(binary.storedPath)) {
    return binary.storedPath
  }
  const rel = relativePathFromBinary(binary.storedPath, binary.sourcePath, binary.filename)
  return resolveContainerFilePath(rel)
}

export async function enrichCatalogEntry(binary: DeploymentBinaryDto): Promise<DeploymentBinaryDto> {
  const exists = Boolean(await resolveBinaryLocalPath(binary))
  if (!exists && binary.status !== 'missing' && binary.status !== 'disabled') {
    updateDeploymentBinary(binary.id, { status: 'missing' })
    return { ...binary, status: 'missing' }
  }
  if (exists && binary.status === 'missing') {
    updateDeploymentBinary(binary.id, { status: 'available' })
    return { ...binary, status: 'available' }
  }
  return binary
}

export async function listCatalogEnriched(): Promise<DeploymentBinaryDto[]> {
  const rows = listDeploymentBinaries()
  return Promise.all(rows.map(enrichCatalogEntry))
}

export async function listContainerWithRegistration(): Promise<ContainerBinaryListItem[]> {
  const files = await scanContainerBinariesDir()
  const catalog = listDeploymentBinaries()
  const byRel = new Map<string, DeploymentBinaryDto>()
  const bySha = new Map<string, DeploymentBinaryDto>()
  for (const b of catalog) {
    const rel = relativePathFromBinary(b.storedPath, b.sourcePath, b.filename)
    byRel.set(rel, b)
    bySha.set(b.sha256, b)
  }

  const items: ContainerBinaryListItem[] = []
  for (const f of files) {
    let sha256: string | null = null
    let registered = false
    let catalogId: string | null = null
    try {
      const abs = await resolveContainerFilePath(f.relativePath)
      if (abs) {
        sha256 = await computeFileSha256(abs)
        const match = byRel.get(f.relativePath) ?? bySha.get(sha256)
        if (match) {
          registered = true
          catalogId = match.id
        }
      }
    } catch {
      /* skip hash */
    }
    items.push({ ...f, sha256, registered, catalogId })
  }
  return items
}

async function registerFileAtPath(params: {
  absolutePath: string
  relativePath: string
  filename: string
  allowDuplicate?: boolean
}): Promise<DeploymentBinaryDto> {
  const st = await stat(params.absolutePath)
  if (!st.isFile()) {
    throw createError({ statusCode: 400, message: 'Fichier introuvable' })
  }

  const { maxBytes } = getDeploymentConfig()
  if (st.size > maxBytes) {
    throw createError({ statusCode: 413, message: 'Fichier trop volumineux' })
  }

  const sha256 = await computeFileSha256(params.absolutePath)
  const existing = getBinaryBySha256(sha256)
  if (existing && !params.allowDuplicate) {
    throw createError({
      statusCode: 409,
      message: 'Un binaire avec ce checksum existe déjà dans le catalogue',
      data: { code: 'DUPLICATE_SHA256', binaryId: existing.id },
    })
  }

  const installSpec = await loadInstallSpecForFile(params.absolutePath, params.filename)
  const id = randomUUID()

  return insertDeploymentBinary({
    id,
    name: inferBinaryName(params.filename),
    version: installSpec.version ?? null,
    filename: params.filename,
    sourcePath: params.relativePath,
    storedPath: params.absolutePath,
    sizeBytes: st.size,
    sha256,
    kind: inferBinaryKind(params.filename),
    installSpec,
    status: 'available',
  })
}

export async function uploadBinaryToContainer(
  filename: string,
  data: Buffer,
): Promise<DeploymentBinaryDto> {
  const safe = validateUploadFilename(filename)

  const { maxBytes } = getDeploymentConfig()
  if (data.length > maxBytes) {
    throw createError({
      statusCode: 413,
      message: `Fichier trop volumineux (max ${Math.floor(maxBytes / (1024 ** 2))} MiB)`,
      data: { code: 'FILE_TOO_LARGE', maxBytes },
    })
  }

  const binariesDir = await assertBinariesDirWritable()
  const existing = await resolveContainerFilePath(safe)
  if (existing) {
    throw createError({
      statusCode: 409,
      message: `Un fichier nommé « ${safe} » existe déjà dans le conteneur`,
      data: { code: 'FILE_EXISTS' },
    })
  }

  const absolutePath = await writeBinaryFileAtomic(binariesDir, safe, data)

  try {
    return await registerFileAtPath({
      absolutePath,
      relativePath: safe,
      filename: safe,
    })
  } catch (err) {
    await unlink(absolutePath).catch(() => {})
    throw err
  }
}

export async function registerContainerBinary(filename: string, allowDuplicate?: boolean): Promise<DeploymentBinaryDto> {
  const safe = sanitizeBinaryFilename(filename)
  if (!safe) {
    throw createError({ statusCode: 400, message: 'Nom de fichier invalide' })
  }
  const absolutePath = await resolveContainerFilePath(safe)
  if (!absolutePath) {
    throw createError({ statusCode: 404, message: 'Fichier absent du conteneur' })
  }
  return registerFileAtPath({
    absolutePath,
    relativePath: safe,
    filename: safe,
    allowDuplicate,
  })
}

export async function deleteCatalogEntryOnly(binaryId: string): Promise<void> {
  const binary = getDeploymentBinaryById(binaryId)
  if (!binary) throw createError({ statusCode: 404, message: 'Binaire introuvable' })
  deleteDeploymentBinary(binaryId)
}

export async function deletePhysicalFile(binaryId: string): Promise<{ fileRemoved: boolean; binary: DeploymentBinaryDto | null }> {
  const binary = getDeploymentBinaryById(binaryId)
  if (!binary) throw createError({ statusCode: 404, message: 'Binaire introuvable' })

  const rel = relativePathFromBinary(binary.storedPath, binary.sourcePath, binary.filename)
  let fileRemoved = false
  try {
    fileRemoved = await deleteContainerFileByRelative(rel)
  } catch { /* guarded path */ }

  updateDeploymentBinary(binaryId, { status: 'missing' })
  return { fileRemoved, binary: getDeploymentBinaryById(binaryId) }
}

export async function deleteCatalogAndFile(binaryId: string): Promise<{ fileRemoved: boolean; warning?: string }> {
  const binary = getDeploymentBinaryById(binaryId)
  if (!binary) throw createError({ statusCode: 404, message: 'Binaire introuvable' })

  const rel = relativePathFromBinary(binary.storedPath, binary.sourcePath, binary.filename)
  let fileRemoved = false
  let warning: string | undefined
  try {
    fileRemoved = await deleteContainerFileByRelative(rel)
    if (!fileRemoved) warning = 'Le fichier physique était déjà absent'
  } catch {
    warning = 'Impossible de supprimer le fichier physique'
  }

  deleteDeploymentBinary(binaryId)
  return { fileRemoved, warning }
}

export async function assertBinaryDeployable(binaryId: string): Promise<DeploymentBinaryDto> {
  const row = getDeploymentBinaryById(binaryId)
  if (!row) throw createError({ statusCode: 404, message: 'Binaire catalogue introuvable' })
  const binary = await enrichCatalogEntry(row)
  if (binary.status === 'missing') {
    throw createError({ statusCode: 400, message: 'Le fichier binaire est absent du conteneur', data: { code: 'BINARY_MISSING' } })
  }
  if (binary.status === 'disabled') {
    throw createError({ statusCode: 400, message: 'Binaire désactivé' })
  }
  const local = await resolveBinaryLocalPath(binary)
  if (!local) {
    updateDeploymentBinary(binary.id, { status: 'missing' })
    throw createError({ statusCode: 400, message: 'Fichier binaire introuvable sur le disque', data: { code: 'BINARY_MISSING' } })
  }
  return { ...binary, storedPath: local }
}
