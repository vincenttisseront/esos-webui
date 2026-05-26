import type {
  AdvancedBlockBackend,
  AdvancedTechId,
  BcacheDevice,
  DmCacheTarget,
  LvmCacheVolume,
  MultipathMap,
  RbdMapping,
  ZfsPool,
} from '../../types/advanced-storage'
import type { DRBDStatus } from './parsers/drbd.parser'
import type { LsblkAdvancedRow } from './parsers/advanced-storage/lsblk-advanced.parser'

export interface MergeBlockBackendsInput {
  lsblkRows:      LsblkAdvancedRow[]
  drbd:           DRBDStatus
  multipathMaps:  MultipathMap[]
  bcacheDevices:  BcacheDevice[]
  dmTargets:      DmCacheTarget[]
  lvmCacheVolumes: LvmCacheVolume[]
  rbdMappings:    RbdMapping[]
  zfsPools:       ZfsPool[]
}

function lsblkByPath(rows: LsblkAdvancedRow[]): Map<string, LsblkAdvancedRow> {
  const m = new Map<string, LsblkAdvancedRow>()
  for (const r of rows) m.set(r.path, r)
  return m
}

function hintsFromLsblk(row?: LsblkAdvancedRow): string[] {
  const hints: string[] = []
  if (!row) return hints
  if (row.mountpoint) hints.push('mounted')
  if (row.fstype?.toLowerCase().includes('lvm')) hints.push('lvm')
  if (row.type === 'crypt') hints.push('crypt')
  return hints
}

function upsert(
  map: Map<string, AdvancedBlockBackend>,
  backend: AdvancedBlockBackend,
): void {
  const existing = map.get(backend.path)
  if (!existing) {
    map.set(backend.path, backend)
    return
  }
  existing.usedByHints = [...new Set([...existing.usedByHints, ...backend.usedByHints])]
  existing.sizeBytes = existing.sizeBytes ?? backend.sizeBytes
  existing.details = { ...existing.details, ...backend.details }
}

export function mergeAdvancedBlockBackends(input: MergeBlockBackendsInput): AdvancedBlockBackend[] {
  const map = new Map<string, AdvancedBlockBackend>()
  const lsblk = lsblkByPath(input.lsblkRows)

  const drbdRows = [...lsblk.values()].filter(r => /drbd/i.test(r.path))
  for (const row of drbdRows) {
    const res = input.drbd.resources.find(r => row.name.includes(r.name) || row.path.includes(r.name))
    upsert(map, {
      path: row.path,
      kind: 'drbd',
      displayName: res?.name ?? row.name,
      sizeBytes: res?.sizeBytes || row.sizeBytes,
      sourceTech: 'drbd',
      details: res ? { role: res.role, connState: res.connState } : undefined,
      usedByHints: hintsFromLsblk(row),
    })
  }
  if (!drbdRows.length) {
    for (const res of input.drbd.resources) {
      upsert(map, {
        path: `/dev/${res.name}`,
        kind: 'drbd',
        displayName: res.name,
        sizeBytes: res.sizeBytes,
        sourceTech: 'drbd',
        details: { role: res.role, connState: res.connState },
        usedByHints: [],
      })
    }
  }

  for (const mp of input.multipathMaps) {
    const path = mp.dmDevice.startsWith('/dev') ? mp.dmDevice : `/dev/mapper/${mp.alias}`
    const row = lsblk.get(path)
    upsert(map, {
      path,
      kind: 'multipath',
      displayName: mp.alias,
      sizeBytes: row?.sizeBytes,
      sourceTech: 'multipath',
      details: { wwid: mp.wwid, pathCount: mp.pathCount },
      usedByHints: hintsFromLsblk(row),
    })
  }

  for (const bc of input.bcacheDevices) {
    const path = bc.backingPath ?? `/dev/bcache${bc.name}`
    const row = lsblk.get(path)
    upsert(map, {
      path,
      kind: 'bcache',
      displayName: bc.name,
      sizeBytes: row?.sizeBytes,
      sourceTech: 'bcache',
      details: bc.state ? { state: bc.state } : undefined,
      usedByHints: hintsFromLsblk(row),
    })
  }

  for (const dm of input.dmTargets) {
    const path = `/dev/mapper/${dm.name}`
    const row = lsblk.get(path)
    upsert(map, {
      path,
      kind: 'dm_cache',
      displayName: dm.name,
      sizeBytes: row?.sizeBytes,
      sourceTech: 'dm_cache',
      details: { cacheMode: dm.cacheMode ?? '', origin: dm.origin ?? '' },
      usedByHints: hintsFromLsblk(row),
    })
  }

  for (const lv of input.lvmCacheVolumes) {
    const path = `/dev/${lv.vg}/${lv.lv.split('/').pop()}`
    upsert(map, {
      path,
      kind: 'lvm_cache',
      displayName: lv.lv,
      sourceTech: 'lvm_cache',
      details: { segtype: lv.segtype, cacheMode: lv.cacheMode ?? '' },
      usedByHints: ['lvm'],
    })
  }

  for (const rbd of input.rbdMappings) {
    const row = lsblk.get(rbd.device)
    upsert(map, {
      path: rbd.device,
      kind: 'rbd',
      displayName: `${rbd.pool}/${rbd.image}`,
      sizeBytes: row?.sizeBytes,
      sourceTech: 'ceph_rbd',
      details: { pool: rbd.pool, image: rbd.image },
      usedByHints: hintsFromLsblk(row),
    })
  }

  for (const row of input.lsblkRows) {
    if (!/drbd|mpath|mapper\/|rbd|bcache/i.test(row.path)) continue
    if (map.has(row.path)) continue
    let kind: AdvancedBlockBackend['kind'] = 'multipath'
    let tech: AdvancedTechId = 'multipath'
    if (row.path.includes('drbd')) { kind = 'drbd'; tech = 'drbd' }
    else if (row.path.includes('rbd')) { kind = 'rbd'; tech = 'ceph_rbd' }
    else if (row.path.includes('bcache')) { kind = 'bcache'; tech = 'bcache' }
    upsert(map, {
      path: row.path,
      kind,
      displayName: row.name,
      sizeBytes: row.sizeBytes,
      sourceTech: tech,
      usedByHints: hintsFromLsblk(row),
    })
  }

  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path))
}
