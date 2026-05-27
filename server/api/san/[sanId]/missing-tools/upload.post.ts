import { readMultipartFormData } from 'h3'
import { randomUUID, createHash } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getSSHPool } from '~~/server/utils/ssh-pool'
import { assertSanWritable } from '~~/server/utils/san-request-context'
import { transferLocalFileViaSsh } from '~~/server/utils/upgrade-package-transfer'
import { setMissingToolsPackageStatus } from '~~/server/utils/missing-tools-package-store'

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024

function validatePerccliRpmFilename(name: string): boolean {
  const base = name.split(/[\\/]/).pop() ?? name
  return /^perccli-.*\.rpm$/i.test(base)
}

function remoteRpmPath(stagingId: string): string {
  return `/tmp/esos-missing-tools-${stagingId}.rpm`
}

/**
 * POST /api/san/:sanId/missing-tools/upload
 * Multipart: file (.rpm)
 */
export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  assertSanWritable(sanId)

  const maxBytes = Number(process.env.NUXT_MISSING_TOOLS_MAX_RPM_BYTES ?? DEFAULT_MAX_BYTES)

  const form = await readMultipartFormData(event)
  if (!form?.length) throw createError({ statusCode: 400, message: 'multipart requis' })

  const filePart = form.find(p => p.name === 'file' && p.filename && p.data)
  if (!filePart?.filename || !filePart.data) {
    throw createError({ statusCode: 400, message: 'file requis' })
  }

  if (!validatePerccliRpmFilename(filePart.filename)) {
    throw createError({ statusCode: 400, message: 'Nom de fichier RPM non supporté (perccli-*.rpm requis)' })
  }

  if (filePart.data.length > maxBytes) {
    throw createError({ statusCode: 413, message: `RPM trop volumineux (max ${Math.floor(maxBytes / (1024 ** 2))} MiB)` })
  }

  const stagingId = randomUUID()
  const safeName = filePart.filename.replace(/[^\w.-]/g, '_')
  const localTemp = join(tmpdir(), `esos-missing-tools-${stagingId}-${safeName}`)
  const sha256 = createHash('sha256').update(filePart.data).digest('hex')

  setMissingToolsPackageStatus({
    stagingId,
    sanId,
    filename: filePart.filename,
    bytesTotal: filePart.data.length,
    bytesTransferred: 0,
    sha256,
    phase: 'uploading',
    updatedAt: Date.now(),
  })

  try {
    await writeFile(localTemp, filePart.data)
    const pool = getSSHPool()
    const manager = await pool.getOrCreate(sanId)

    const remotePath = remoteRpmPath(stagingId)
    setMissingToolsPackageStatus({
      stagingId,
      sanId,
      filename: filePart.filename,
      bytesTotal: filePart.data.length,
      bytesTransferred: 0,
      sha256,
      phase: 'transferring',
      updatedAt: Date.now(),
      remoteRpmPath: remotePath,
    })

    await transferLocalFileViaSsh(manager, localTemp, remotePath, {
      onProgress: (bytesTransferred, bytesTotal) => {
        setMissingToolsPackageStatus({
          stagingId,
          sanId,
          filename: filePart.filename,
          bytesTotal,
          bytesTransferred,
          sha256,
          phase: 'transferring',
          updatedAt: Date.now(),
          remoteRpmPath: remotePath,
        })
      },
    })

    setMissingToolsPackageStatus({
      stagingId,
      sanId,
      filename: filePart.filename,
      bytesTotal: filePart.data.length,
      bytesTransferred: filePart.data.length,
      sha256,
      phase: 'ready',
      updatedAt: Date.now(),
      remoteRpmPath: remotePath,
    })

    return { stagingId, sha256, remoteRpmPath: remotePath }
  } catch (err: any) {
    setMissingToolsPackageStatus({
      stagingId,
      sanId,
      filename: filePart.filename,
      bytesTotal: filePart.data.length,
      bytesTransferred: 0,
      sha256,
      phase: 'error',
      updatedAt: Date.now(),
      error: err?.message ?? 'Upload échoué',
    })
    throw createError({ statusCode: 500, message: err?.message ?? 'Upload échoué' })
  } finally {
    try { await unlink(localTemp) } catch { /* ignore */ }
  }
})

