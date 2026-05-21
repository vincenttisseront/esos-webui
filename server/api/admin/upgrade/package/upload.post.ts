import { readMultipartFormData } from 'h3'
import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { getSSHPool } from '../../../../utils/ssh-pool'
import { assertSanWritable } from '../../../../utils/san-request-context'
import {
  buildExtractAndVerifyScript,
  remoteArchivePath,
  remoteStagingDir,
  transferLocalFileViaSsh,
  validatePackageFilename,
} from '../../../../utils/upgrade-package-transfer'
import { getUpgradePackageStatus, setUpgradePackageStatus } from '../../../../utils/upgrade-package-store'
import { REQUIRED_TMP_BYTES, UPGRADE_PROBE_CMD, parseProbeSections, parseTmpFreeBytes } from '../../../../utils/upgrade-readiness'

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024

/**
 * POST /api/admin/upgrade/package/upload
 * Multipart: file, sanId, optional expectedVersion, optional sha256 (hex).
 */
export default defineEventHandler(async (event) => {
  const maxBytes = Number(process.env.NUXT_UPGRADE_MAX_PACKAGE_BYTES ?? DEFAULT_MAX_BYTES)

  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({ statusCode: 400, message: 'multipart requis' })
  }

  let sanId = ''
  let expectedVersion = ''
  let expectedSha256 = ''
  let filePart: (typeof form)[0] | undefined

  for (const part of form) {
    if (part.name === 'sanId' && part.data) sanId = part.data.toString('utf-8').trim()
    if (part.name === 'expectedVersion' && part.data) {
      expectedVersion = part.data.toString('utf-8').trim()
    }
    if (part.name === 'sha256' && part.data) {
      expectedSha256 = part.data.toString('utf-8').trim().toLowerCase()
    }
    if (part.name === 'file' && part.filename) filePart = part
  }

  if (!sanId || !filePart?.filename || !filePart.data) {
    throw createError({ statusCode: 400, message: 'sanId et file requis' })
  }

  if (!validatePackageFilename(filePart.filename)) {
    throw createError({
      statusCode: 400,
      message: 'Format de fichier non supporté (.zip, .tar.gz, .tgz)',
      data: { code: 'upgrade.invalid_package_format' },
    })
  }

  if (filePart.data.length > maxBytes) {
    throw createError({
      statusCode: 413,
      message: `Paquet trop volumineux (max ${Math.floor(maxBytes / (1024 ** 3))} GiB)`,
      data: { code: 'upgrade.package_too_large' },
    })
  }

  if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw createError({ statusCode: 400, message: 'sha256 invalide' })
  }

  const actualSha = createHash('sha256').update(filePart.data).digest('hex')
  if (expectedSha256 && actualSha !== expectedSha256) {
    throw createError({
      statusCode: 400,
      message: 'Checksum SHA-256 incorrect',
      data: { code: 'upgrade.checksum_mismatch' },
    })
  }

  assertSanWritable(sanId)

  const stagingId = randomUUID()
  const localTemp = join(tmpdir(), `esos-upgrade-${stagingId}-${filePart.filename.replace(/[^\w.-]/g, '_')}`)

  setUpgradePackageStatus({
    stagingId,
    sanId,
    phase: 'uploading',
    filename: filePart.filename,
    bytesTotal: filePart.data.length,
    bytesTransferred: 0,
    updatedAt: Date.now(),
  })

  try {
    await writeFile(localTemp, filePart.data)

    const pool = getSSHPool()
    const mgr = pool.getOrCreate(sanId)
    if (mgr.getStatus() !== 'connected') {
      await mgr.connect()
    }

    const probe = await mgr.exec(UPGRADE_PROBE_CMD, 25_000)
    const sections = parseProbeSections(probe.stdout)
    const tmpFree = parseTmpFreeBytes(sections.TMP_DF ?? '')
    const needed = filePart.data.length + REQUIRED_TMP_BYTES
    if (tmpFree !== null && tmpFree < needed) {
      throw createError({
        statusCode: 400,
        message: 'Espace /tmp insuffisant pour le paquet et l\'extraction',
        data: { code: 'upgrade.insufficient_tmp' },
      })
    }

    const remotePath = remoteArchivePath(stagingId, filePart.filename)
    const stagingDir = remoteStagingDir(stagingId)

    setUpgradePackageStatus({
      stagingId,
      sanId,
      phase: 'transferring',
      filename: filePart.filename,
      remoteArchivePath: remotePath,
      stagingDir,
      bytesTotal: filePart.data.length,
      bytesTransferred: 0,
      updatedAt: Date.now(),
    })

    await transferLocalFileViaSsh(mgr, localTemp, remotePath, {
      onProgress: (transferred, total) => {
        setUpgradePackageStatus({
          stagingId,
          sanId,
          phase: 'transferring',
          filename: filePart.filename,
          remoteArchivePath: remotePath,
          stagingDir,
          bytesTotal: total,
          bytesTransferred: transferred,
          updatedAt: Date.now(),
        })
      },
    })

    setUpgradePackageStatus({
      stagingId,
      sanId,
      phase: 'extracting',
      filename: filePart.filename,
      remoteArchivePath: remotePath,
      stagingDir,
      bytesTotal: filePart.data.length,
      bytesTransferred: filePart.data.length,
      updatedAt: Date.now(),
    })

    const extractScript = buildExtractAndVerifyScript(remotePath, stagingDir)
    const extractResult = await mgr.exec(extractScript, 300_000)
    const out = extractResult.stdout + extractResult.stderr
    const installMatch = out.match(/INSTALL_PATH=(.+)/)
    const installPath = installMatch?.[1]?.trim()
    const installOk = out.includes('INSTALL_OK')

    if (extractResult.code !== 0 || !installOk) {
      setUpgradePackageStatus({
        stagingId,
        sanId,
        phase: 'error',
        filename: filePart.filename,
        remoteArchivePath: remotePath,
        stagingDir,
        error: extractResult.stderr?.trim() || 'install.sh introuvable ou extraction échouée',
        updatedAt: Date.now(),
      })
      throw createError({
        statusCode: 400,
        message: 'Extraction ou install.sh invalide',
        data: { code: 'upgrade.extract_failed' },
      })
    }

    console.log('[upgrade][audit]', JSON.stringify({
      userId: event.context.user?.id,
      sanId,
      stagingId,
      filename: filePart.filename,
      bytes: filePart.data.length,
      sha256: actualSha,
      expectedVersion: expectedVersion || undefined,
    }))

    setUpgradePackageStatus({
      stagingId,
      sanId,
      phase: 'ready',
      filename: filePart.filename,
      remoteArchivePath: remotePath,
      stagingDir,
      installShPath: installPath,
      bytesTotal: filePart.data.length,
      bytesTransferred: filePart.data.length,
      updatedAt: Date.now(),
    })

    return {
      stagingId,
      sanId,
      phase: 'ready' as const,
      remoteArchivePath: remotePath,
      stagingDir,
      installShPath: installPath,
      sha256: actualSha,
      expectedVersion: expectedVersion || undefined,
    }
  } catch (err: unknown) {
    const status = getUpgradePackageStatus(stagingId)
    if (status && status.phase !== 'error') {
      setUpgradePackageStatus({
        ...status,
        phase: 'error',
        error: err instanceof Error ? err.message : 'Erreur de staging',
        updatedAt: Date.now(),
      })
    }
    throw err
  } finally {
    await unlink(localTemp).catch(() => {})
  }
})
