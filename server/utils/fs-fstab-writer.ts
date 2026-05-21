import { shellSingleQuoteForRemote } from './remote-config-paths'
import { buildAtomicBase64FileWriteScript } from './remote-file-writer'
import type { SSHSessionManager } from './ssh-session-manager'

export const FSTAB_PATH = '/etc/fstab'

export function buildFstabAppendScript(existingContent: string, newLine: string): string {
  const trimmed = newLine.trim()
  if (!trimmed) throw new Error('Ligne fstab vide')
  if (existingContent.split('\n').some(l => l.trim() === trimmed)) {
    return 'true'
  }
  const mountMatch = trimmed.split(/\s+/)[1]
  const lines = existingContent.split('\n').filter(l => {
    const t = l.trim()
    if (!t || t.startsWith('#')) return true
    const parts = t.split(/\s+/)
    return parts[1] !== mountMatch
  })
  lines.push(trimmed)
  const next = lines.join('\n').replace(/\n*$/, '\n')
  return buildAtomicBase64FileWriteScript(FSTAB_PATH, next)
}

export async function appendFstabLine(
  manager: SSHSessionManager,
  line: string,
): Promise<void> {
  const qPath = shellSingleQuoteForRemote(FSTAB_PATH)
  const read = await manager.exec(`cat ${qPath} 2>/dev/null || true`, 10_000)
  const script = buildFstabAppendScript(read.stdout, line)
  const result = await manager.exec(script, 30_000)
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || 'Échec mise à jour fstab')
  }
}
