import { createReadStream } from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { SSHSessionManager } from './ssh-session-manager'
import { shellSingleQuoteForRemote } from './remote-config-paths'

const CHUNK_RAW_BYTES = 384 * 1024

function heredocDelimiter(): string {
  return `ESOS_UPG_${randomBytes(8).toString('hex')}`
}

/** Build shell fragment: decode base64 chunk into remote path (truncate or append). */
export function buildBase64ChunkScript(
  remotePath: string,
  b64Chunk: string,
  append: boolean,
): string {
  const delim = heredocDelimiter()
  if (b64Chunk.includes(delim)) {
    throw new Error('Chunk collides with heredoc delimiter')
  }
  const qPath = shellSingleQuoteForRemote(remotePath)
  const op = append ? `>> ${qPath}` : `> ${qPath}`
  return `base64 -d ${op} <<'${delim}'\n${b64Chunk}\n${delim}`
}

export async function transferLocalFileViaSsh(
  manager: SSHSessionManager,
  localFilePath: string,
  remotePath: string,
  options?: {
    onProgress?: (transferred: number, total: number) => void
    timeoutMsPerChunk?: number
  },
): Promise<void> {
  const { statSync } = await import('node:fs')
  const total = statSync(localFilePath).size
  let transferred = 0
  let append = false

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(localFilePath, { highWaterMark: CHUNK_RAW_BYTES })
    const chunks: Buffer[] = []

    stream.on('data', (chunk: Buffer | string) => {
      stream.pause()
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(buf)
      const process = async () => {
        try {
          while (chunks.length > 0) {
            const data = Buffer.concat(chunks)
            chunks.length = 0
            if (data.length === 0) {
              stream.resume()
              return
            }
            const b64 = data.toString('base64')
            const script = buildBase64ChunkScript(remotePath, b64, append)
            append = true
            const result = await manager.exec(script, options?.timeoutMsPerChunk ?? 120_000)
            if (result.code !== 0) {
              reject(new Error(result.stderr?.trim() || result.stdout?.trim() || `transfer exit ${result.code}`))
              return
            }
            transferred += data.length
            options?.onProgress?.(transferred, total)
            stream.resume()
          }
        } catch (e) {
          reject(e)
        }
      }
      void process()
    })

    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
}

export const ALLOWED_PACKAGE_EXTENSIONS = ['.zip', '.tar.gz', '.tgz', '.tar'] as const

export function validatePackageFilename(name: string): boolean {
  const lower = name.toLowerCase()
  return ALLOWED_PACKAGE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

export function remoteArchivePath(stagingId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const ext = ALLOWED_PACKAGE_EXTENSIONS.find(e => safe.toLowerCase().endsWith(e)) ?? '.zip'
  const base = safe.replace(new RegExp(`${ext.replace('.', '\\.')}$`), '') || 'package'
  return `/tmp/esos-upgrade-${stagingId}${ext.startsWith('.') ? ext : `.${ext}`}`
}

export function remoteStagingDir(stagingId: string): string {
  return `/tmp/esos-upgrade-staging-${stagingId}`
}

/** Allowlisted extract + install.sh detection (no install execution). */
export function buildExtractAndVerifyScript(
  archivePath: string,
  stagingDir: string,
): string {
  const qArch = shellSingleQuoteForRemote(archivePath)
  const qDir = shellSingleQuoteForRemote(stagingDir)
  return [
    `mkdir -p ${qDir}`,
    `if echo ${qArch} | grep -qi '\\.zip$'; then`,
    `  unzip -oq ${qArch} -d ${qDir}`,
    `elif echo ${qArch} | grep -qiE '\\.(tar\\.gz|tgz)$'; then`,
    `  tar -xzf ${qArch} -C ${qDir}`,
    `else`,
    `  echo FORMAT_UNSUPPORTED`,
    `  exit 2`,
    `fi`,
    `install=$(find ${qDir} -name install.sh -type f 2>/dev/null | head -1)`,
    `echo "INSTALL_PATH=$install"`,
    `test -n "$install" && test -x "$install" && echo INSTALL_OK || echo INSTALL_MISSING`,
  ].join('\n')
}
