import { getSSHPool } from './ssh-pool'
import { assertAllowedRemoteConfigPath } from './remote-config-paths'

/**
 * Writes a config file on the remote SAN, taking a backup first.
 * Optionally runs conf_sync.sh to persist changes across reboots.
 */
export async function writeConfigFile(
  sanId:   string,
  path:    string,
  content: string,
  sync    = true,
): Promise<void> {
  assertAllowedRemoteConfigPath(path)

  const pool    = getSSHPool()
  const manager = await pool.getOrCreate(sanId)
  if (!manager) throw new Error(`No SSH manager for SAN: ${sanId}`)

  // Encode content as base64 to avoid heredoc quoting issues
  const b64   = Buffer.from(content).toString('base64')
  const cmds  = [
    `cp -f "${path}" "${path}.bak" 2>/dev/null || true`,
    `echo "${b64}" | base64 -d > "${path}"`,
  ]
  if (sync) cmds.push('conf_sync.sh 2>/dev/null || true')

  const script = cmds.join(' && ')
  const { stderr } = await manager.exec(script, 30_000)

  if (stderr && !/No such file or directory/.test(stderr)) {
    throw new Error(`writeConfigFile(${path}): ${stderr}`)
  }
}

/**
 * Runs an arbitrary command on the remote SAN.
 *
 * **Security:** do not concatenate user-controlled strings into `cmd` without strict
 * validation and shell-safe quoting (see Batch 2C — `remote-config-paths.ts`).
 *
 * @param sync  If true (default) awaits the result. If false, fire-and-forget.
 */
export async function runCommand(
  sanId:      string,
  cmd:        string,
  sync        = true,
  timeoutMs   = 15_000,
): Promise<{ stdout: string; stderr: string }> {
  const pool    = getSSHPool()
  const manager = await pool.getOrCreate(sanId)
  if (!manager) throw new Error(`No SSH manager for SAN: ${sanId}`)

  if (!sync) {
    manager.exec(`( ${cmd} ) &`, timeoutMs).catch(() => { /* fire-and-forget */ })
    return { stdout: '', stderr: '' }
  }

  return manager.exec(cmd, timeoutMs)
}
