import { collectLvmOverview } from './lvm-overview.service'
import { collectRaidOverview } from './raid-overview.service'
import { buildLvmCandidatesFromInventory } from './lvm-candidates'
import type { FsBackendCandidate, FsBackendKind } from '~/types/filesystem'
import type { SSHSessionManager } from './ssh-session-manager'

const MD_PATH_RE = /^\/dev\/md[a-z0-9_-]{0,15}$/i

function kindFromPath(path: string, lvPaths: Set<string>): FsBackendKind {
  if (lvPaths.has(path) || path.includes('/mapper/')) return 'lvm_lv'
  if (MD_PATH_RE.test(path)) return 'md'
  if (path.startsWith('/dev/sd') || path.startsWith('/dev/nvme')) return 'disk'
  return 'hw_raid_ld'
}

export async function collectFsBackendCandidates(
  manager: SSHSessionManager,
  options?: { allowRawDisk?: boolean },
): Promise<FsBackendCandidate[]> {
  const [raid, lvm] = await Promise.all([
    collectRaidOverview(manager),
    collectLvmOverview(manager),
  ])

  const lvPaths = new Set(lvm.lvs.map(lv => lv.path))
  const candidates: FsBackendCandidate[] = []
  const seen = new Set<string>()

  for (const lv of lvm.lvs) {
    if (seen.has(lv.path)) continue
    seen.add(lv.path)
    const reasons: string[] = []
    if (lv.usedBy?.includes('scst') || (lv.scstDeviceNames?.length ?? 0) > 0) {
      reasons.push('Utilisé par SCST (blockio)')
    }
    if (lv.usedBy?.includes('mounted')) reasons.push('Monté')
    candidates.push({
      path: lv.path,
      kind: 'lvm_lv',
      sizeBytes: lv.sizeBytes,
      eligible: reasons.length === 0,
      reasons,
      displayName: lv.displayName,
    })
  }

  for (const arr of raid.mdArrays) {
    if (arr.state !== 'clean' && arr.state !== 'active') continue
    const path = arr.path
    if (!path || seen.has(path)) continue
    seen.add(path)
    const dev = raid.blockDevices.find(d => d.path === path)
    const reasons: string[] = []
    if (dev?.usedBy.includes('mounted')) reasons.push('Monté')
    if (dev?.usedBy.includes('scst')) reasons.push('Utilisé par SCST')
    if (dev?.usedBy.includes('filesystem')) reasons.push('Système de fichiers détecté')
    candidates.push({
      path,
      kind: 'md',
      sizeBytes: arr.sizeBytes ?? dev?.sizeBytes ?? 0,
      eligible: reasons.length === 0,
      reasons,
      displayName: arr.name,
    })
  }

  const pvPaths = new Set(lvm.pvs.map(p => p.path))
  const lvmCands = buildLvmCandidatesFromInventory({
    blockDevices: raid.blockDevices,
    mdArrays: raid.mdArrays,
    hardwareControllers: raid.hardwareControllers,
    pvs: lvm.pvs,
    lvPaths,
  })

  for (const c of lvmCands) {
    if (c.kind !== 'hw_raid_ld') continue
    if (seen.has(c.path)) continue
    seen.add(c.path)
    const reasons = [...c.reasons]
    if (c.usedBy.includes('mounted')) reasons.push('Monté')
    if (c.usedBy.includes('scst')) reasons.push('Utilisé par SCST')
    candidates.push({
      path: c.path,
      kind: 'hw_raid_ld',
      sizeBytes: c.sizeBytes,
      eligible: reasons.length === 0,
      reasons,
    })
  }

  if (options?.allowRawDisk) {
    for (const dev of raid.blockDevices) {
      if (dev.type !== 'disk' || seen.has(dev.path) || pvPaths.has(dev.path)) continue
      const reasons: string[] = []
      if (dev.usedBy.includes('mounted')) reasons.push('Monté')
      if (dev.usedBy.includes('scst')) reasons.push('SCST')
      if (dev.usedBy.includes('filesystem')) reasons.push('Filesystem')
      candidates.push({
        path: dev.path,
        kind: kindFromPath(dev.path, lvPaths),
        sizeBytes: dev.sizeBytes,
        eligible: reasons.length === 0,
        reasons,
      })
    }
  }

  return candidates
}
