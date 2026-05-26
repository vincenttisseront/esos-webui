import type {
  LocalSymmetricLvmIssue,
  LogicalVolume,
  LvmCandidateDevice,
  PhysicalVolume,
  VolumeGroup,
} from '~/types/lvm'
import { lvCanBindScst, vgsWithFreeSpace } from '~/utils/lvm-action-availability'

export type ProvisioningStepId = 'source' | 'pv' | 'vg' | 'lv' | 'scst'
export type ProvisioningStepStatus = 'ready' | 'created' | 'missing' | 'blocked' | 'next' | 'optional'

export type LvmNextActionKind =
  | 'need_source'
  | 'create_pv'
  | 'create_vg'
  | 'create_lv'
  | 'bind_scst'
  | 'complete'
  | 'blocked'
  | 'readonly'

export interface ProvisioningStepView {
  id: ProvisioningStepId | string
  status: ProvisioningStepStatus
  detail: string
  count?: number
  hintKey?: string
  messageParams?: Record<string, string>
  clusterProgress?: { ready: number; total: number; labelKey: string }
}

export interface LvmNextAction {
  kind: LvmNextActionKind
  messageKey: string
  messageParams?: Record<string, string>
  actionLabelKey?: string
  action?: 'pv' | 'vg' | 'lv' | 'scst' | 'block_devices'
  targetPath?: string
  targetVg?: string
  targetLv?: LogicalVolume
  nextStepId?: ProvisioningStepId
}

export interface LvmProvisioningContext {
  candidates: LvmCandidateDevice[]
  pvs: PhysicalVolume[]
  vgs: VolumeGroup[]
  lvs: LogicalVolume[]
  orphanPvs: PhysicalVolume[]
  readOnly?: boolean
  symmetryIssues?: LocalSymmetricLvmIssue[]
}

export function pickSourcePath(
  candidates: LvmCandidateDevice[],
  pvs: PhysicalVolume[],
): string | null {
  const eligible = candidates.filter(c => c.eligible)
  const preferred = eligible.find(c => c.kind === 'md' || c.kind === 'hw_raid_ld')
  if (preferred) return preferred.path
  if (eligible[0]) return eligible[0].path
  if (pvs[0]) return pvs[0].path
  return null
}

function firstUnboundLv(lvs: LogicalVolume[]): LogicalVolume | undefined {
  return lvs.find(lv => lvCanBindScst(lv))
}

function vgWithMostFree(vgs: VolumeGroup[]): VolumeGroup | undefined {
  if (!vgs.length) return undefined
  return vgs.reduce((best, v) => (v.freeBytes > best.freeBytes ? v : best), vgs[0])
}

function hasCriticalSymmetry(issues: LocalSymmetricLvmIssue[] | undefined): LocalSymmetricLvmIssue | undefined {
  return issues?.find(i => i.severity === 'critical')
}

function hasClusteredVg(vgs: VolumeGroup[]): boolean {
  return vgs.some(v => v.clustered)
}

export function computeLvmNextAction(ctx: LvmProvisioningContext): LvmNextAction {
  if (ctx.readOnly) {
    return {
      kind: 'readonly',
      messageKey: 'lvm.provisioning.next.readonly',
      nextStepId: 'source',
    }
  }

  const critical = hasCriticalSymmetry(ctx.symmetryIssues)
  if (critical) {
    return {
      kind: 'blocked',
      messageKey: 'lvm.provisioning.next.blocked',
      messageParams: { reason: critical.message },
      nextStepId: 'vg',
    }
  }

  if (hasClusteredVg(ctx.vgs)) {
    return {
      kind: 'blocked',
      messageKey: 'lvm.cluster.blocked_clvmd',
      nextStepId: 'vg',
    }
  }

  if (ctx.pvs.length === 0) {
    const path = pickSourcePath(ctx.candidates, ctx.pvs)
    if (path) {
      return {
        kind: 'create_pv',
        messageKey: 'lvm.provisioning.next.create_pv',
        messageParams: { path },
        actionLabelKey: 'lvm.provisioning.next.cta.create_pv',
        action: 'pv',
        targetPath: path,
        nextStepId: 'pv',
      }
    }
    return {
      kind: 'need_source',
      messageKey: 'lvm.provisioning.next.need_source',
      actionLabelKey: 'lvm.provisioning.next.cta.open_block_devices',
      action: 'block_devices',
      nextStepId: 'source',
    }
  }

  if (ctx.vgs.length === 0) {
    const orphan = ctx.orphanPvs[0]
    if (orphan) {
      return {
        kind: 'create_vg',
        messageKey: 'lvm.provisioning.next.create_vg',
        messageParams: { path: orphan.path },
        actionLabelKey: 'lvm.provisioning.next.cta.create_vg',
        action: 'vg',
        targetPath: orphan.path,
        nextStepId: 'vg',
      }
    }
    return {
      kind: 'blocked',
      messageKey: 'lvm.provisioning.next.blocked_no_orphan_pv',
      nextStepId: 'vg',
    }
  }

  if (ctx.lvs.length === 0) {
    const freeVgs = vgsWithFreeSpace(ctx.vgs)
    const vg = freeVgs.length ? vgWithMostFree(freeVgs) : undefined
    if (vg && vg.freeBytes > 0) {
      return {
        kind: 'create_lv',
        messageKey: 'lvm.provisioning.next.create_lv',
        messageParams: { vg: vg.name },
        actionLabelKey: 'lvm.provisioning.next.cta.create_lv',
        action: 'lv',
        targetVg: vg.name,
        nextStepId: 'lv',
      }
    }
    return {
      kind: 'blocked',
      messageKey: 'lvm.provisioning.next.blocked_no_vg_space',
      nextStepId: 'lv',
    }
  }

  const unbound = firstUnboundLv(ctx.lvs)
  if (unbound) {
    return {
      kind: 'bind_scst',
      messageKey: 'lvm.provisioning.next.bind_scst',
      messageParams: { lvPath: unbound.path },
      actionLabelKey: 'lvm.provisioning.next.cta.bind_scst',
      action: 'scst',
      targetLv: unbound,
      nextStepId: 'scst',
    }
  }

  return {
    kind: 'complete',
    messageKey: 'lvm.provisioning.next.blockio_complete',
    nextStepId: 'scst',
  }
}

function scstDetail(lvs: LogicalVolume[]): { detail: string; bound: boolean } {
  const bound = lvs.filter(lv => !lvCanBindScst(lv))
  if (bound.length) {
    const names = bound.flatMap(lv => lv.scst?.deviceNames ?? lv.scstDeviceNames ?? [])
    return { detail: names.join(', '), bound: true }
  }
  const unbound = firstUnboundLv(lvs)
  return { detail: unbound?.path ?? '', bound: false }
}

function baseStepStatus(
  satisfied: boolean,
  missing: boolean,
  blocked: boolean,
  nextId: ProvisioningStepId | undefined,
  stepId: ProvisioningStepId,
): ProvisioningStepStatus {
  if (nextId === stepId) return 'next'
  if (blocked) return 'blocked'
  if (satisfied) return 'created'
  if (missing) return 'missing'
  return 'ready'
}

export function buildProvisioningChain(ctx: LvmProvisioningContext): ProvisioningStepView[] {
  const next = computeLvmNextAction(ctx)
  const nextId = next.nextStepId
  const readOnly = !!ctx.readOnly
  const critical = hasCriticalSymmetry(ctx.symmetryIssues)
  const clvmd = hasClusteredVg(ctx.vgs)

  const sourcePath = pickSourcePath(ctx.candidates, ctx.pvs)
  const sourceSatisfied = !!sourcePath && (ctx.pvs.length > 0 || ctx.candidates.some(c => c.eligible))
  const sourceMissing = !sourcePath && ctx.pvs.length === 0
  const sourceBlocked = readOnly || (critical && ctx.pvs.length === 0)

  const pvSatisfied = ctx.pvs.length > 0
  const pvMissing = !pvSatisfied && !!sourcePath
  const pvBlocked = readOnly || critical

  const vgSatisfied = ctx.vgs.length > 0
  const vgMissing = pvSatisfied && !vgSatisfied
  const vgBlocked = readOnly || critical || clvmd || (next.kind === 'blocked' && next.nextStepId === 'vg' && !ctx.orphanPvs.length)

  const lvSatisfied = ctx.lvs.length > 0
  const lvMissing = vgSatisfied && !lvSatisfied
  const lvBlocked = readOnly || critical || (next.kind === 'blocked' && next.nextStepId === 'lv')

  const scstInfo = scstDetail(ctx.lvs)
  const scstSatisfied = scstInfo.bound
  const scstMissing = lvSatisfied && !scstSatisfied
  const scstBlocked = readOnly || critical

  return [
    {
      id: 'source',
      status: baseStepStatus(sourceSatisfied, sourceMissing, sourceBlocked, nextId, 'source'),
      detail: sourcePath ?? '—',
    },
    {
      id: 'pv',
      status: baseStepStatus(pvSatisfied, pvMissing, pvBlocked, nextId, 'pv'),
      detail: ctx.pvs[0]?.path ?? '—',
      count: ctx.pvs.length,
    },
    {
      id: 'vg',
      status: baseStepStatus(vgSatisfied, vgMissing, vgBlocked, nextId, 'vg'),
      detail: ctx.vgs[0]?.name ?? '—',
      count: ctx.vgs.length,
      hintKey: clvmd ? 'lvm.cluster.blocked_clvmd' : undefined,
    },
    {
      id: 'lv',
      status: baseStepStatus(lvSatisfied, lvMissing, lvBlocked, nextId, 'lv'),
      detail: ctx.lvs[0]?.path ?? '—',
      count: ctx.lvs.length,
    },
    {
      id: 'scst',
      status: scstSatisfied
        ? 'created'
        : baseStepStatus(scstSatisfied, scstMissing, scstBlocked, nextId, 'scst'),
      detail: scstInfo.detail || '—',
      hintKey: scstSatisfied
        ? 'lvm.provisioning.scst.blockio_complete_fileio_optional'
        : 'lvm.provisioning.scst.unbound',
    },
  ]
}
