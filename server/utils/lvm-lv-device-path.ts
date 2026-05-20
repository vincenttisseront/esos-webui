import { buildLvPathCandidates } from '~/utils/lvm-lv-path'
import type { SSHSessionManager } from './ssh-session-manager'

export async function resolveBlockDevicePathFromCandidates(
  manager: SSHSessionManager,
  candidates: string[],
): Promise<{ path?: string; candidates: string[] }> {
  for (const candidate of candidates) {
    const quoted = candidate.replace(/'/g, `'\\''`)
    try {
      const result = await manager.exec(`test -b '${quoted}' && echo ok || echo missing`, 10_000)
      if (result.stdout.trim().includes('ok')) {
        return { path: candidate, candidates }
      }
    } catch {
      /* try next candidate */
    }
  }
  return { candidates }
}

export async function resolveBlockDevicePathOnNode(
  manager: SSHSessionManager,
  vgName: string,
  lvName: string,
  reported?: { lvPath?: string; lvDmPath?: string },
): Promise<{ path?: string; candidates: string[] }> {
  return resolveBlockDevicePathFromCandidates(
    manager,
    buildLvPathCandidates(vgName, lvName, reported),
  )
}

/** Activate VG/LV and wait for udev after lvcreate (best-effort). */
export async function activateLogicalVolume(
  manager: SSHSessionManager,
  vgName: string,
  lvName: string,
): Promise<void> {
  const qVg = vgName.replace(/'/g, `'\\''`)
  const qLv = `${qVg}/${lvName.replace(/'/g, `'\\''`)}`
  const cmd = [
    `vgchange -ay '${qVg}' 2>/dev/null || true`,
    `lvchange -ay '${qLv}' 2>/dev/null || true`,
    'if command -v udevadm >/dev/null 2>&1; then udevadm settle -t 30 2>/dev/null || udevadm settle 2>/dev/null || true; fi',
  ].join(' && ')
  try {
    await manager.exec(cmd, 60_000)
  } catch {
    /* best-effort */
  }
}
