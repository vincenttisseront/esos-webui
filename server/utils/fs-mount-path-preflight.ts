import { shellSingleQuoteForRemote } from './remote-config-paths'
import type { SSHSessionManager } from './ssh-session-manager'

export type MountPathRemoteState =
  | 'not_exists'
  | 'empty_dir'
  | 'non_empty_dir'
  | 'not_directory'
  | 'already_mounted'
  | 'parent_missing'

export async function probeMountPathOnNode(
  manager: SSHSessionManager,
  mountPoint: string,
): Promise<MountPathRemoteState> {
  const q = shellSingleQuoteForRemote(mountPoint.trim())
  const script = [
    `mp=${q}`,
    'if findmnt -n "$mp" 2>/dev/null | grep -q .; then echo already_mounted; exit 0; fi',
    'if [ -e "$mp" ]; then',
    '  if [ ! -d "$mp" ]; then echo not_directory; exit 0; fi',
    '  if [ -n "$(ls -A "$mp" 2>/dev/null | head -1)" ]; then echo non_empty_dir; else echo empty_dir; fi',
    '  exit 0',
    'fi',
    'parent=$(dirname "$mp")',
    'if [ "$parent" = "$mp" ] || [ -d "$parent" ]; then echo not_exists; else echo parent_missing; fi',
  ].join('\n')
  const r = await manager.exec(`bash -lc ${shellSingleQuoteForRemote(script)}`, 20_000)
  const line = (r.stdout || '').trim().split('\n').pop()?.trim() ?? ''
  switch (line) {
    case 'already_mounted':
      return 'already_mounted'
    case 'non_empty_dir':
      return 'non_empty_dir'
    case 'empty_dir':
      return 'empty_dir'
    case 'not_directory':
      return 'not_directory'
    case 'parent_missing':
      return 'parent_missing'
    default:
      return 'not_exists'
  }
}

export function mountPathStateBlockerKey(state: MountPathRemoteState): string | null {
  switch (state) {
    case 'already_mounted':
      return 'storage.fs.errors.mount_point_already_mounted'
    case 'non_empty_dir':
      return 'storage.fs.errors.mount_point_not_empty'
    case 'not_directory':
      return 'storage.fs.errors.mount_point_not_directory'
    case 'parent_missing':
      return 'storage.fs.errors.mount_point_parent_missing'
    default:
      return null
  }
}

export function mountPathStateWarningKey(state: MountPathRemoteState): string | null {
  if (state === 'empty_dir') return 'storage.fs.wizard.create_fs.warn_mount_dir_empty'
  return null
}
