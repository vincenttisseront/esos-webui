/** i18n keys for FILEIO backend eligibility (reasons[] in API). */

export const FS_BACKEND_REASON = {
  SCST_BLOCKIO: 'storage.fs.backend.reason.scst_blockio',
  SCST: 'storage.fs.backend.reason.scst',
  MOUNTED: 'storage.fs.backend.reason.mounted',
  MOUNTED_AT: 'storage.fs.backend.reason.mounted_at',
  FILESYSTEM_SIGNATURE: 'storage.fs.backend.reason.filesystem_signature',
  LVM_PV: 'storage.fs.backend.reason.lvm_pv',
  LVM_LV: 'storage.fs.backend.reason.lvm_lv',
  MD_MEMBER: 'storage.fs.backend.reason.md_member',
} as const

export function mountedAtReason(mountPoint: string): string {
  return `${FS_BACKEND_REASON.MOUNTED_AT}:${mountPoint}`
}

export function parseMountedAtReason(raw: string): string | null {
  const prefix = `${FS_BACKEND_REASON.MOUNTED_AT}:`
  if (raw.startsWith(prefix)) return raw.slice(prefix.length)
  return null
}

/** Map legacy French reason strings to i18n keys (cached overview / tests). */
export function normalizeBackendReason(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('storage.')) return t

  if (t === 'Utilisé par SCST (blockio)') return FS_BACKEND_REASON.SCST_BLOCKIO
  if (t === 'Utilisé par SCST') return FS_BACKEND_REASON.SCST
  if (t === 'Monté') return FS_BACKEND_REASON.MOUNTED
  if (t.startsWith('Monté sur ')) return mountedAtReason(t.slice('Monté sur '.length))
  if (t === 'Signature ou système de fichiers détecté') return FS_BACKEND_REASON.FILESYSTEM_SIGNATURE
  if (t === 'Volume physique LVM') return FS_BACKEND_REASON.LVM_PV
  if (t === 'Logical volume LVM') return FS_BACKEND_REASON.LVM_LV
  if (t === 'Membre ou métadonnées MD') return FS_BACKEND_REASON.MD_MEMBER

  return t
}
