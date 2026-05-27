import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getSSHPool } from '~~/server/utils/ssh-pool'
import { assertSanWritable } from '~~/server/utils/san-request-context'
import { transferLocalFileViaSsh } from '~~/server/utils/upgrade-package-transfer'
import { setMissingToolsPackageStatus } from '~~/server/utils/missing-tools-package-store'
import { assertBinaryDeployable, resolveBinaryLocalPath } from '~~/server/utils/deployment-binaries-service'

const bodySchema = z.object({
  binaryId: z.string().min(1),
})

function remoteRpmPath(stagingId: string): string {
  return `/tmp/esos-missing-tools-${stagingId}.rpm`
}

/**
 * POST /api/san/:sanId/missing-tools/stage-from-catalog
 * Transfère un RPM du catalogue vers le SAN (remplace l'upload navigateur).
 */
export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  assertSanWritable(sanId)

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Corps invalide' })
  }

  const binary = await assertBinaryDeployable(parsed.data.binaryId)
  if (binary.kind !== 'rpm') {
    throw createError({ statusCode: 400, message: 'Seuls les RPM du catalogue sont acceptés pour perccli' })
  }
  const localPath = await resolveBinaryLocalPath(binary)
  if (!localPath) {
    throw createError({ statusCode: 400, message: 'Fichier binaire absent du conteneur WebUI' })
  }

  const stagingId = randomUUID()
  const remotePath = remoteRpmPath(stagingId)

  setMissingToolsPackageStatus({
    stagingId,
    sanId,
    filename: binary.filename,
    bytesTotal: binary.sizeBytes,
    bytesTransferred: 0,
    sha256: binary.sha256,
    phase: 'transferring',
    updatedAt: Date.now(),
    remoteRpmPath: remotePath,
  })

  try {
    const pool = getSSHPool()
    const manager = await pool.getOrCreate(sanId)
    await transferLocalFileViaSsh(manager, localPath, remotePath, {
      onProgress: (done) => {
        setMissingToolsPackageStatus({
          stagingId,
          sanId,
          filename: binary.filename,
          bytesTotal: binary.sizeBytes,
          bytesTransferred: done,
          sha256: binary.sha256,
          phase: 'transferring',
          updatedAt: Date.now(),
          remoteRpmPath: remotePath,
        })
      },
    })

    setMissingToolsPackageStatus({
      stagingId,
      sanId,
      filename: binary.filename,
      bytesTotal: binary.sizeBytes,
      bytesTransferred: binary.sizeBytes,
      sha256: binary.sha256,
      phase: 'ready',
      updatedAt: Date.now(),
      remoteRpmPath: remotePath,
    })

    return { ok: true, stagingId, binaryId: binary.id }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setMissingToolsPackageStatus({
      stagingId,
      sanId,
      filename: binary.filename,
      bytesTotal: binary.sizeBytes,
      bytesTransferred: 0,
      sha256: binary.sha256,
      phase: 'error',
      updatedAt: Date.now(),
      error: message,
    })
    throw createError({ statusCode: 502, message })
  }
})
