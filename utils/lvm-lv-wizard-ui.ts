/** Client-side LV create form validation (GiB input vs byte limit). */
export function validateLvCreateSizeGib(
  sizeGib: number,
  maxBytes: number,
): 'zero' | 'exceeds' | null {
  if (!Number.isFinite(sizeGib) || sizeGib <= 0) return 'zero'
  const sizeBytes = Math.floor(sizeGib * 1024 ** 3)
  if (maxBytes > 0 && sizeBytes > maxBytes) return 'exceeds'
  if (maxBytes === 0 && sizeBytes > 0) return 'exceeds'
  return null
}

export function formatLvSizeGibLabel(sizeGib: number): string {
  if (!Number.isFinite(sizeGib) || sizeGib <= 0) return ''
  const rounded = Number.isInteger(sizeGib) ? String(sizeGib) : sizeGib.toFixed(1)
  return `${rounded} GiB`
}

export function formatLvmBytes(n: number): string {
  if (!n) return '0 B'
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${u[i]}`
}
