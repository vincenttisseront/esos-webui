import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { DeploymentBinaryDto, DeploymentInstallSpec } from '~/types/deployment'
import {
  getBinaryBySha256,
  insertDeploymentBinary,
  listDeploymentBinaries,
  getDeploymentBinaryById,
} from '../db/repositories/deployment.repository'
import { getDeploymentConfig } from './deployment-config'
import {
  inferBinaryKind,
  inferBinaryName,
  resolvePathUnderRoot,
} from './deployment-binaries-scan'

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

function parseDeployManifest(raw: string): DeploymentInstallSpec {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>
    const spec: DeploymentInstallSpec = {}
    if (typeof j.version === 'string') spec.version = j.version
    if (typeof j.remotePath === 'string') spec.remotePath = j.remotePath
    if (j.installKind === 'copy_executable' || j.installKind === 'rpm' || j.installKind === 'perccli') {
      spec.installKind = j.installKind
    }
    return spec
  } catch {
    return {}
  }
}

async function loadInstallSpec(sourceFile: string, filename: string): Promise<DeploymentInstallSpec> {
  const sidecar = `${sourceFile}.deploy.json`
  try {
    const raw = await readFile(sidecar, 'utf-8')
    return parseDeployManifest(raw)
  } catch {
    /* no sidecar */
  }
  const spec: DeploymentInstallSpec = {}
  const lower = filename.toLowerCase()
  if (lower.includes('perccli') && lower.endsWith('.rpm')) {
    spec.installKind = 'perccli'
  } else if (lower.endsWith('.rpm')) {
    spec.installKind = 'rpm'
  } else {
    spec.installKind = 'copy_executable'
    spec.remotePath = `/usr/local/sbin/${basename(filename)}`
  }
  return spec
}

export async function importContainerBinary(params: {
  sourceRelativePath: string
  allowDuplicate?: boolean
}): Promise<DeploymentBinaryDto> {
  const { binariesDir, catalogDir, maxBytes } = getDeploymentConfig()
  const resolved = await resolvePathUnderRoot(binariesDir, params.sourceRelativePath)
  if (!resolved) {
    throw createError({ statusCode: 400, message: 'Chemin source invalide', data: { code: 'INVALID_PATH' } })
  }

  const st = await stat(resolved)
  if (!st.isFile()) {
    throw createError({ statusCode: 400, message: 'Le chemin ne pointe pas vers un fichier' })
  }
  if (st.size > maxBytes) {
    throw createError({ statusCode: 413, message: `Fichier trop volumineux (max ${Math.floor(maxBytes / (1024 ** 2))} MiB)` })
  }

  const filename = basename(resolved)
  const sha256 = await computeFileSha256(resolved)
  const existing = getBinaryBySha256(sha256)
  if (existing && !params.allowDuplicate) {
    throw createError({
      statusCode: 409,
      message: 'Un binaire avec ce checksum existe déjà dans le catalogue',
      data: { code: 'DUPLICATE_SHA256', binaryId: existing.id },
    })
  }

  await mkdir(catalogDir, { recursive: true })
  const id = randomUUID()
  const storedFilename = `${id}-${filename.replace(/[^\w.-]/g, '_')}`
  const storedPath = join(catalogDir, storedFilename)
  await copyFile(resolved, storedPath)

  const installSpec = await loadInstallSpec(resolved, filename)
  const kind = inferBinaryKind(filename)
  const name = inferBinaryName(filename)

  return insertDeploymentBinary({
    id,
    name,
    version: installSpec.version ?? null,
    filename,
    sourcePath: params.sourceRelativePath,
    storedPath,
    sizeBytes: st.size,
    sha256,
    kind,
    installSpec,
  })
}

export async function importUploadedBinary(params: {
  localTempPath: string
  originalFilename: string
  allowDuplicate?: boolean
}): Promise<DeploymentBinaryDto> {
  const { catalogDir, maxBytes } = getDeploymentConfig()
  const st = await stat(params.localTempPath)
  if (st.size > maxBytes) {
    throw createError({ statusCode: 413, message: 'Fichier trop volumineux' })
  }

  const sha256 = await computeFileSha256(params.localTempPath)
  const existing = getBinaryBySha256(sha256)
  if (existing && !params.allowDuplicate) {
    throw createError({
      statusCode: 409,
      message: 'Checksum déjà enregistré',
      data: { code: 'DUPLICATE_SHA256', binaryId: existing.id },
    })
  }

  await mkdir(catalogDir, { recursive: true })
  const id = randomUUID()
  const safeName = params.originalFilename.replace(/[^\w.-]/g, '_')
  const storedPath = join(catalogDir, `${id}-${safeName}`)
  await copyFile(params.localTempPath, storedPath)

  const installSpec = await loadInstallSpec(params.localTempPath, params.originalFilename)
  const kind = inferBinaryKind(params.originalFilename)
  const name = inferBinaryName(params.originalFilename)

  return insertDeploymentBinary({
    id,
    name,
    version: installSpec.version ?? null,
    filename: params.originalFilename,
    sourcePath: null,
    storedPath,
    sizeBytes: st.size,
    sha256,
    kind,
    installSpec,
  })
}

export { listDeploymentBinaries, getDeploymentBinaryById }
