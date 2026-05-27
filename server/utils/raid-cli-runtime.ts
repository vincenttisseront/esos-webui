import type { SSHSessionManager } from './ssh-session-manager'
import {
  buildResolveRaidCliShell,
  buildValidateRaidCliShell,
  extractStorCliJsonPayload,
  storCliJsonHasControllers,
} from '../../utils/raid-cli-path'

export async function resolveRaidCliExecutable(
  manager: SSHSessionManager,
  hint?: string | null,
): Promise<string | null> {
  try {
    const { stdout } = await manager.exec(buildResolveRaidCliShell(hint), 12_000)
    const line = stdout.split('\n').map(l => l.trim()).find(l => l.startsWith('/'))
    return line ?? null
  } catch {
    return null
  }
}

export async function validateRaidCliExecutable(
  manager: SSHSessionManager,
  cliPath: string,
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const { stdout, exitCode } = await manager.exec(buildValidateRaidCliShell(cliPath), 25_000)
    const payload = extractStorCliJsonPayload(stdout)
    if (storCliJsonHasControllers(payload)) {
      return { ok: true }
    }
    if (exitCode === 0 && /controller/i.test(stdout)) {
      return { ok: true }
    }
    const { stdout: textOut } = await manager.exec(
      `${cliPath.replace(/'/g, `'\\''`)} /call show 2>/dev/null | head -30`,
      15_000,
    )
    if (/Product Name|Controller\s+\d|Basics/i.test(textOut)) {
      return { ok: true }
    }
    return { ok: false, detail: 'perccli/storcli /call show returned no controller data' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, detail: msg }
  }
}
