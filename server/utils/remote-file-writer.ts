import { randomBytes } from 'node:crypto'
import { shellSingleQuoteForRemote } from './remote-config-paths'
import type { SSHSessionManager } from './ssh-session-manager'

/** Encode UTF-8 text as a single-line base64 payload (no PEM wrapping). */
export function contentToBase64(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64')
}

function heredocDelimiter(): string {
  return `ESOS_B64_${randomBytes(12).toString('hex')}`
}

/**
 * Build a shell script fragment that decodes base64 from a quoted heredoc into a temp
 * file, validates size, then atomically moves to targetPath. Does not use printf with
 * raw file content.
 */
export function buildAtomicBase64FileWriteScript(
  targetPath: string,
  content: string,
  options?: { requireNonEmpty?: boolean },
): string {
  const b64 = contentToBase64(content)
  const delim = heredocDelimiter()
  if (b64.includes(delim)) {
    throw new Error('Internal error: base64 payload collides with heredoc delimiter')
  }
  const qPath = shellSingleQuoteForRemote(targetPath)
  const lines = [
    `tmp=$(printf '%s.tmp.%s' ${qPath} $$)`,
    `base64 -d > "$tmp" <<'${delim}'`,
    b64,
    delim,
  ]
  if (options?.requireNonEmpty !== false) {
    lines.push('[ -s "$tmp" ]')
  }
  lines.push(`mv "$tmp" ${qPath}`)
  return lines.join('\n')
}

export type RemoteFileWriteLog = {
  targetPath: string
  commandPreview: string
  stdout: string
  stderr: string
  code: number
}

/** Run atomic base64 write on an open SSH session; logs stdout/stderr. */
export async function writeRemoteFileAtomic(
  manager: SSHSessionManager,
  targetPath: string,
  content: string,
  options?: { requireNonEmpty?: boolean; logTag?: string },
): Promise<RemoteFileWriteLog> {
  const writeScript = buildAtomicBase64FileWriteScript(targetPath, content, options)
  const tag = options?.logTag ?? 'remote-file'
  const result = await manager.exec(writeScript, 60_000)
  const log: RemoteFileWriteLog = {
    targetPath,
    commandPreview: `${tag}: atomic write (${content.length} bytes → base64 ${contentToBase64(content).length} chars)`,
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
  }
  if (result.code !== 0) {
    console.error(`[${tag}] write failed path=${targetPath} code=${result.code}`, {
      stderr: result.stderr?.slice(0, 500),
      stdout: result.stdout?.slice(0, 200),
    })
  } else if (result.stderr?.trim()) {
    console.warn(`[${tag}] write stderr path=${targetPath}`, result.stderr.slice(0, 300))
  } else {
    console.log(`[${tag}] write ok path=${targetPath}`)
  }
  return log
}

export async function writeRemoteFileAtomicOrThrow(
  manager: SSHSessionManager,
  targetPath: string,
  content: string,
  options?: { requireNonEmpty?: boolean; logTag?: string; errorPrefix?: string },
): Promise<void> {
  const log = await writeRemoteFileAtomic(manager, targetPath, content, options)
  if (log.code !== 0) {
    const detail = log.stderr.trim() || log.stdout.trim() || `exit ${log.code}`
    throw new Error(`${options?.errorPrefix ?? 'Écriture fichier distante'} : ${detail}`)
  }
}

/** Decode base64 produced by {@link contentToBase64} (for unit tests). */
export function decodeBase64Content(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf-8')
}
