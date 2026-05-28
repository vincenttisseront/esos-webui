export type FsSizeUnit = 'gib' | 'mib'

export function parseFsSizeToBytes(value: number, unit: FsSizeUnit): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return unit === 'gib'
    ? Math.floor(value * 1024 ** 3)
    : Math.floor(value * 1024 ** 2)
}

export function formatFsBytes(n: number): string {
  if (!n) return '0 B'
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${u[i]}`
}

export function pickDefaultFsBackend(
  candidates: Array<{ path: string; eligible: boolean; kind?: string }>,
): string {
  const eligible = candidates.filter(c => c.eligible)
  const preferred = eligible.find(c => c.kind === 'hw_raid_ld')
  if (preferred) return preferred.path
  return eligible[0]?.path ?? ''
}
