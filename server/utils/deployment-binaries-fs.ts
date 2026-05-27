import { mkdir, unlink } from 'node:fs/promises'
import { basename } from 'node:path'
import { getDeploymentConfig } from './deployment-config'
import { resolvePathUnderRoot } from './deployment-binaries-scan'

const SAFE_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,200}$/

/** Sanitize upload filename — basename only, safe chars. */
export function sanitizeBinaryFilename(raw: string): string | null {
  const base = basename(raw.replace(/\\/g, '/'))
  if (!base || base.startsWith('.')) return null
  if (base.includes('..')) return null
  if (!SAFE_FILENAME.test(base)) return null
  return base
}

export async function ensureBinariesDir(): Promise<string> {
  const { binariesDir } = getDeploymentConfig()
  await mkdir(binariesDir, { recursive: true })
  return binariesDir
}

export async function resolveContainerFilePath(relativeOrFilename: string): Promise<string | null> {
  const { binariesDir } = getDeploymentConfig()
  return resolvePathUnderRoot(binariesDir, relativeOrFilename)
}

export async function deleteContainerFileByRelative(relativePath: string): Promise<boolean> {
  const resolved = await resolveContainerFilePath(relativePath)
  if (!resolved) {
    throw createError({ statusCode: 400, message: 'Chemin invalide' })
  }
  try {
    await unlink(resolved)
    return true
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return false
    throw err
  }
}

export function relativePathFromBinary(storedPath: string, sourcePath: string | null, filename: string): string {
  return sourcePath ?? filename
}
