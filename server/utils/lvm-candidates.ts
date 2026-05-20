import type { RaidBlockDevice } from './raid-types'
import type { LvmCandidateDevice, LvmCandidateKind, LvmUsedBy, PhysicalVolume } from './lvm-types'

const MD_PATH_RE = /^\/dev\/md[a-z0-9_-]{0,15}$/i

function candidateKind(dev: RaidBlockDevice): LvmCandidateKind {
  if (dev.type === 'raid' || MD_PATH_RE.test(dev.path)) return 'md'
  if (dev.type === 'disk') return 'disk'
  if (dev.type === 'part') return 'part'
  return 'unknown'
}

function mapUsedBy(dev: RaidBlockDevice): LvmUsedBy[] {
  const out: LvmUsedBy[] = []
  for (const u of dev.usedBy) {
    if (u === 'hardware_raid') continue
    if (u === 'filesystem' || u === 'md' || u === 'lvm' || u === 'scst' || u === 'mounted' || u === 'unknown_signature') {
      out.push(u)
    }
  }
  if (dev.type === 'lvm') out.push('lvm')
  return [...new Set(out)]
}

export function buildLvmCandidates(
  blockDevices: RaidBlockDevice[],
  pvs: PhysicalVolume[],
  lvPaths: Set<string>,
): LvmCandidateDevice[] {
  const pvPaths = new Set(pvs.map(p => p.path))
  const candidates: LvmCandidateDevice[] = []

  for (const dev of blockDevices) {
    if (dev.type === 'lvm' || dev.type === 'rom') continue
    if (lvPaths.has(dev.path)) continue
    if (pvPaths.has(dev.path)) continue

    const kind = candidateKind(dev)
    const reasons: string[] = []
    const usedBy = mapUsedBy(dev)

    if (dev.type === 'part') {
      reasons.push('Seuls les disques entiers ou tableaux MD sont éligibles pour pvcreate')
    }
    if (dev.mountpoint || usedBy.includes('mounted')) {
      reasons.push(dev.mountpoint ? `Monté sur ${dev.mountpoint}` : 'Périphérique monté')
    }
    if (usedBy.includes('lvm')) reasons.push('Déjà volume physique LVM')
    if (usedBy.includes('scst')) reasons.push('Utilisé par SCST')
    if (usedBy.includes('md') && kind !== 'md') reasons.push('Membre ou signal MD')
    if (usedBy.includes('filesystem') || usedBy.includes('unknown_signature')) {
      reasons.push('Signature ou système de fichiers détecté — wipefs requis avant pvcreate')
    }
    if (kind === 'unknown') reasons.push('Type de périphérique non pris en charge')

    const stableId = dev.idSerial ?? dev.wwn ?? dev.byIdPaths?.[0]

    candidates.push({
      path: dev.path,
      stableId,
      kind,
      sizeBytes: dev.sizeBytes,
      eligible: reasons.length === 0,
      reasons,
      usedBy,
      signatures: dev.diskSignatures ?? dev.wipefsSignatures ?? [],
      model: dev.model,
      serial: dev.serial,
    })
  }

  return candidates.sort((a, b) => a.path.localeCompare(b.path))
}
