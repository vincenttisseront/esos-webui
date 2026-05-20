/** Format byte size for lvcreate -L (explicit LVM unit, not raw bytes). */
const GIB = 1024 ** 3
const MIB = 1024 ** 2
const KIB = 1024

export function formatLvCreateSizeArg(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0'
  if (sizeBytes % GIB === 0) return `${sizeBytes / GIB}G`
  if (sizeBytes % MIB === 0) return `${sizeBytes / MIB}M`
  if (sizeBytes % KIB === 0) return `${sizeBytes / KIB}K`
  return `${Math.floor(sizeBytes)}b`
}

export function overviewHasLv(
  lvs: Array<{ vgName: string; name: string }>,
  vgName: string,
  lvName: string,
): boolean {
  const vg = vgName.trim()
  const name = lvName.trim()
  return lvs.some(l => l.vgName === vg && l.name === name)
}
