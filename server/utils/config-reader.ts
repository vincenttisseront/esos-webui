import { getSSHPool } from './ssh-pool'
import { assertAllowedRemoteConfigPath } from './remote-config-paths'

const FILE_NOT_FOUND = '__NOT_FOUND__'

/**
 * Reads multiple config files from a remote SAN in a single SSH exec.
 * Returns a Map of path → content (or FILE_NOT_FOUND sentinel if the file doesn't exist).
 */
export async function readConfigFiles(sanId: string, paths: string[]): Promise<Map<string, string>> {
  for (const p of paths) assertAllowedRemoteConfigPath(p)

  const pool    = getSSHPool()
  const manager = await pool.getOrCreate(sanId)
  if (!manager) throw new Error(`No SSH manager for SAN: ${sanId}`)

  const cmds = paths.map(p =>
    `echo "===FILE:${p}==="; cat "${p}" 2>/dev/null || echo "${FILE_NOT_FOUND}"`
  )
  const script = cmds.join('; ')

  const { stdout } = await manager.exec(script, 30_000)

  const result = new Map<string, string>()

  for (let i = 0; i < paths.length; i++) {
    const path    = paths[i]
    const marker  = `===FILE:${path}===`
    const nextPath = paths[i + 1]
    const next     = nextPath ? `===FILE:${nextPath}===` : null

    const start = stdout.indexOf(marker)
    if (start === -1) {
      result.set(path, FILE_NOT_FOUND)
      continue
    }

    const contentStart = start + marker.length + 1 // skip newline after marker
    const end          = next ? stdout.indexOf(next) : stdout.length
    const raw          = stdout.slice(contentStart, end).trimEnd()

    result.set(path, raw === FILE_NOT_FOUND ? FILE_NOT_FOUND : raw)
  }

  return result
}

export const NOT_FOUND = FILE_NOT_FOUND
