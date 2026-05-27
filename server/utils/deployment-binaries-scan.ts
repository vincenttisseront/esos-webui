import { readdir, stat } from 'node:fs/promises'
import { join, resolve, relative, extname, basename } from 'node:path'
import { realpath } from 'node:fs/promises'
import type { ContainerBinaryEntry } from '~/types/deployment'
import { getDeploymentConfig } from './deployment-config'

const ALLOWED_EXTENSIONS = new Set(['.rpm', '.gz', '.tgz', '.tar'])

export function isAllowedBinaryFilename(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower.endsWith('.tar.gz')) return true
  if (lower.endsWith('.rpm')) return true
  if (lower.endsWith('.tgz')) return true
  const ext = extname(lower)
  if (ALLOWED_EXTENSIONS.has(ext)) return true
  // bare executable (no extension) — alphanumeric + common chars
  if (!ext && /^[\w.-]+$/.test(name) && !name.startsWith('.')) return true
  return false
}

/** Resolve path and ensure it stays under root (no traversal). */
export async function resolvePathUnderRoot(
  rootDir: string,
  relativePath: string,
): Promise<string | null> {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (normalized.includes('..') || normalized.includes('\0')) return null

  const rootReal = await realpath(rootDir).catch(() => null)
  if (!rootReal) return null

  const candidate = resolve(rootReal, normalized)
  const rel = relative(rootReal, candidate)
  if (rel.startsWith('..') || rel.includes('..')) return null

  const candidateReal = await realpath(candidate).catch(() => null)
  if (!candidateReal) return null
  if (!candidateReal.startsWith(rootReal)) return null

  return candidateReal
}

export async function scanContainerBinariesDir(): Promise<ContainerBinaryEntry[]> {
  const { binariesDir } = getDeploymentConfig()
  const rootReal = await realpath(binariesDir).catch(() => null)
  if (!rootReal) return []

  const entries: ContainerBinaryEntry[] = []

  async function walk(dir: string) {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (name.startsWith('.')) continue
      const full = join(dir, name)
      let st
      try {
        st = await stat(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        await walk(full)
        continue
      }
      if (!st.isFile()) continue
      if (!isAllowedBinaryFilename(name)) continue

      const rel = relative(rootReal, full).replace(/\\/g, '/')
      entries.push({
        relativePath: rel,
        filename: basename(name),
        sizeBytes: st.size,
        mtimeMs: st.mtimeMs,
      })
    }
  }

  await walk(rootReal)
  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

export function inferBinaryKind(filename: string): 'rpm' | 'executable' | 'archive' {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.rpm')) return 'rpm'
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'archive'
  return 'executable'
}

export function inferBinaryName(filename: string): string {
  return basename(filename).replace(/\.(rpm|tar\.gz|tgz)$/i, '')
}
