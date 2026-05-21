import type {
  ClusterLvmNodeInventory,
  LogicalVolume,
  LvmCandidateDevice,
  LvScstBinding,
  PhysicalVolume,
  VolumeGroup,
} from '~/types/lvm'
import { scstDeviceNamesForLvPaths } from '~/utils/lvm-lv-path'
import { listClusterEligiblePaths } from '~/utils/lvm-cluster-ui'

export type LvmActionAvailabilityReasonKey =
  | 'lvm.actions.disabled.readonly'
  | 'lvm.actions.disabled.no_pv_candidate'
  | 'lvm.actions.disabled.all_devices_are_pv'
  | 'lvm.actions.disabled.no_free_pv'
  | 'lvm.actions.disabled.no_vg'
  | 'lvm.actions.disabled.no_vg_free_space'
  | 'lvm.actions.disabled.all_lv_scst_bound'
  | 'lvm.actions.disabled.cluster_no_free_pv'
  | 'lvm.actions.disabled.cluster_no_vg_space'
  | 'lvm.actions.disabled.cluster_no_pv_candidate'

export interface LvmActionAvailability {
  enabled: boolean
  reasonKey?: LvmActionAvailabilityReasonKey
}

export interface LvmActionAvailabilityContext {
  candidates: LvmCandidateDevice[]
  pvs: PhysicalVolume[]
  vgs: VolumeGroup[]
  lvs: LogicalVolume[]
  orphanPvs: PhysicalVolume[]
  readOnly?: boolean
  /** Cluster inventory when `isClustered`. */
  clusterInventory?: ClusterLvmNodeInventory[] | null
  primarySanId?: string
  isClustered?: boolean
}

export type LvScstUiState = 'none' | 'linked' | 'partial'

function disabled(
  reasonKey: LvmActionAvailabilityReasonKey,
): LvmActionAvailability {
  return { enabled: false, reasonKey }
}

function enabled(): LvmActionAvailability {
  return { enabled: true }
}

/** Paths not yet used as PV (eligible disk/md not in `pvs`). */
export function pathsNotYetPv(
  candidates: LvmCandidateDevice[],
  pvs: PhysicalVolume[],
): LvmCandidateDevice[] {
  const pvPaths = new Set(pvs.map(p => p.path))
  return candidates.filter(c => c.eligible && !pvPaths.has(c.path))
}

export function pvCreateAvailability(ctx: LvmActionAvailabilityContext): LvmActionAvailability {
  if (ctx.readOnly) return disabled('lvm.actions.disabled.readonly')

  if (ctx.isClustered && ctx.clusterInventory?.length && ctx.primarySanId) {
    const clusterCandidates = listClusterEligiblePaths(
      ctx.primarySanId,
      ctx.candidates,
      ctx.clusterInventory,
    )
    const notPv = pathsNotYetPv(clusterCandidates, ctx.pvs)
    if (notPv.length) return enabled()
    if (!clusterCandidates.length) return disabled('lvm.actions.disabled.cluster_no_pv_candidate')
    return disabled('lvm.actions.disabled.all_devices_are_pv')
  }

  const notPv = pathsNotYetPv(ctx.candidates, ctx.pvs)
  if (notPv.length) return enabled()
  if (!ctx.candidates.some(c => c.eligible)) return disabled('lvm.actions.disabled.no_pv_candidate')
  return disabled('lvm.actions.disabled.all_devices_are_pv')
}

export function orphanPvsOnAllClusterNodes(
  inventory: ClusterLvmNodeInventory[],
  primarySanId: string,
): PhysicalVolume[] {
  const primary = inventory.find(n => n.sanId === primarySanId)
  if (!primary) return []
  const peers = inventory.filter(n => n.sanId !== primarySanId && n.sshReady)
  const primaryOrphans = primary.overview.pvs.filter(p => !p.vgName)
  return primaryOrphans.filter((pv) => {
    if (!peers.length) return true
    return peers.every(peer =>
      peer.overview.pvs.some(p => !p.vgName && p.path === pv.path),
    )
  })
}

export function vgCreateAvailability(ctx: LvmActionAvailabilityContext): LvmActionAvailability {
  if (ctx.readOnly) return disabled('lvm.actions.disabled.readonly')

  if (ctx.isClustered && ctx.clusterInventory?.length && ctx.primarySanId) {
    const orphans = orphanPvsOnAllClusterNodes(ctx.clusterInventory, ctx.primarySanId)
    if (orphans.length) return enabled()
    if (!ctx.orphanPvs.length) return disabled('lvm.actions.disabled.cluster_no_free_pv')
    return disabled('lvm.actions.disabled.no_free_pv')
  }

  if (ctx.orphanPvs.length) return enabled()
  return disabled('lvm.actions.disabled.no_free_pv')
}

export function vgsWithFreeSpace(vgs: VolumeGroup[]): VolumeGroup[] {
  return vgs.filter(v => !v.clustered && v.freeBytes > 0)
}

export function vgHasFreeSpaceOnAllClusterNodes(
  vgName: string,
  inventory: ClusterLvmNodeInventory[],
  primarySanId: string,
): boolean {
  for (const node of inventory) {
    if (!node.sshReady) continue
    const vg = node.overview.vgs.find(v => v.name === vgName && !v.clustered)
    if (!vg || vg.freeBytes <= 0) return false
  }
  return true
}

export function lvCreateAvailability(ctx: LvmActionAvailabilityContext): LvmActionAvailability {
  if (ctx.readOnly) return disabled('lvm.actions.disabled.readonly')

  const localFree = vgsWithFreeSpace(ctx.vgs)
  if (!localFree.length) {
    if (!ctx.vgs.length) return disabled('lvm.actions.disabled.no_vg')
    return disabled('lvm.actions.disabled.no_vg_free_space')
  }

  if (ctx.isClustered && ctx.clusterInventory?.length && ctx.primarySanId) {
    const anyCluster = localFree.some(v =>
      vgHasFreeSpaceOnAllClusterNodes(v.name, ctx.clusterInventory!, ctx.primarySanId!),
    )
    if (anyCluster) return enabled()
    return disabled('lvm.actions.disabled.cluster_no_vg_space')
  }

  return enabled()
}

export function resolveLvScstBinding(
  pathCandidates: string[],
  pathToDevices: Map<string, string[]>,
): LvScstBinding {
  const deviceNames = scstDeviceNamesForLvPaths(pathToDevices, pathCandidates)
  return {
    state: deviceNames.length ? 'linked' : 'none',
    deviceNames,
  }
}

export function lvScstUiState(lv: LogicalVolume): LvScstUiState {
  if (lv.scst?.state === 'partial') return 'partial'
  const names = lv.scst?.deviceNames ?? lv.scstDeviceNames ?? []
  if (names.length) return 'linked'
  return 'none'
}

export function lvScstDeviceLabel(lv: LogicalVolume): string {
  const names = lv.scst?.deviceNames ?? lv.scstDeviceNames ?? []
  return names.join(', ')
}

export function lvCanBindScst(lv: LogicalVolume): boolean {
  return lvScstUiState(lv) === 'none'
}

export function lvCanRepairScst(lv: LogicalVolume): boolean {
  return lvScstUiState(lv) === 'partial'
}

export function bindScstAvailability(ctx: LvmActionAvailabilityContext): LvmActionAvailability {
  if (ctx.readOnly) return disabled('lvm.actions.disabled.readonly')
  if (!ctx.lvs.length) return disabled('lvm.actions.disabled.no_vg')
  const unbound = ctx.lvs.filter(lv => lvCanBindScst(lv))
  if (unbound.length) return enabled()
  return disabled('lvm.actions.disabled.all_lv_scst_bound')
}

export function lvBindScstRowAvailability(
  lv: LogicalVolume,
  readOnly?: boolean,
): LvmActionAvailability {
  if (readOnly) return disabled('lvm.actions.disabled.readonly')
  if (lvCanBindScst(lv)) return enabled()
  if (lvCanRepairScst(lv)) return enabled()
  return disabled('lvm.actions.disabled.all_lv_scst_bound')
}

/** Cluster LV row: SCST linked on every connected node. */
export function clusterLvScstStateForKey(
  nodes: ClusterLvmNodeInventory[],
  vgName: string,
  lvName: string,
): LvScstUiState {
  const ready = nodes.filter(n => n.sshReady)
  if (!ready.length) return 'none'
  let linked = 0
  for (const node of ready) {
    const lv = node.overview.lvs.find(l => l.vgName === vgName && l.name === lvName)
    if (lv && lvScstUiState(lv) !== 'none') linked++
  }
  if (linked === 0) return 'none'
  if (linked === ready.length) return 'linked'
  return 'partial'
}

export function buildLvmActionAvailability(ctx: LvmActionAvailabilityContext) {
  return {
    pvCreate: pvCreateAvailability(ctx),
    vgCreate: vgCreateAvailability(ctx),
    lvCreate: lvCreateAvailability(ctx),
    bindScst: bindScstAvailability(ctx),
  }
}

/** Merge per-node SCST state into primary LVs for cluster UI. */
export function enrichLvWithClusterScst(
  lv: LogicalVolume,
  nodes: ClusterLvmNodeInventory[],
): LogicalVolume {
  const ready = nodes.filter(n => n.sshReady)
  if (!ready.length) return lv

  const perNode = ready.map((node) => {
    const peerLv = node.overview.lvs.find(l => l.vgName === lv.vgName && l.name === lv.name)
    const deviceNames = peerLv
      ? (peerLv.scst?.deviceNames ?? peerLv.scstDeviceNames ?? [])
      : []
    return {
      nodeSanId: node.sanId,
      nodeLabel: node.label,
      state: deviceNames.length ? ('linked' as const) : ('missing' as const),
      deviceNames,
    }
  })

  const linkedCount = perNode.filter(p => p.state === 'linked').length
  const state: LvScstBinding['state'] =
    linkedCount === 0 ? 'none' : linkedCount === perNode.length ? 'linked' : 'partial'
  const deviceNames = [...new Set(perNode.flatMap(p => p.deviceNames))]
  const localNames = lv.scst?.deviceNames ?? lv.scstDeviceNames ?? []
  for (const n of localNames) {
    if (!deviceNames.includes(n)) deviceNames.push(n)
  }

  return {
    ...lv,
    scst: { state, deviceNames, perNode },
    scstDeviceNames: deviceNames.length ? deviceNames : undefined,
  }
}
