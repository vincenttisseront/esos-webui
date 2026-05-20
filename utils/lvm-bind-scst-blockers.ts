/** Machine-readable bind_scst preflight blockers (parsed client-side for i18n). */
export const BIND_SCST_BLOCKER_TAG = 'BIND_SCST'

export type BindScstBlockerKind = 'device_exists' | 'lv_not_found' | 'lv_path_missing' | 'lv_path_in_use'

export function bindScstBlocker(
  kind: BindScstBlockerKind,
  ...parts: string[]
): string {
  return [BIND_SCST_BLOCKER_TAG, kind, ...parts].join(':')
}

export function parseBindScstBlocker(
  line: string,
): { kind: BindScstBlockerKind; deviceName?: string; nodeLabel?: string; lvPath?: string; otherDevice?: string } | null {
  if (!line.startsWith(`${BIND_SCST_BLOCKER_TAG}:`)) return null
  const parts = line.split(':')
  const kind = parts[1] as BindScstBlockerKind
  if (kind === 'device_exists') {
    return { kind, deviceName: parts[2], nodeLabel: parts.slice(3).join(':') }
  }
  if (kind === 'lv_not_found') {
    return { kind, lvPath: parts.slice(2).join(':') }
  }
  if (kind === 'lv_path_missing') {
    return { kind, lvPath: parts.slice(2, -1).join(':'), nodeLabel: parts[parts.length - 1] }
  }
  if (kind === 'lv_path_in_use') {
    return {
      kind,
      lvPath: parts[2],
      otherDevice: parts[3],
      nodeLabel: parts.slice(4).join(':'),
    }
  }
  return null
}
