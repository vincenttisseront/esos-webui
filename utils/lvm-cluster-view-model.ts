import type {
  ClusterLvmDiskMapping,
  ClusterLvmNodeInventory,
  LocalSymmetricLvmIssue,
  LogicalVolume,
  LvmNodeSnapshot,
  LvmOverviewResponse,
  PhysicalVolume,
  VolumeGroup,
} from '~/types/lvm'
import { assessClusterSymmetricLvm } from '~/utils/lvm-cluster-symmetry'
import {
  buildProvisioningChain,
  computeLvmNextAction,
  pickSourcePath,
  type LvmNextAction,
  type LvmProvisioningContext,
  type ProvisioningStepId,
  type ProvisioningStepView,
} from '~/utils/lvm-provisioning-chain'

export type ClusterRowStatus =
  | 'ok'
  | 'missing'
  | 'ssh_down'
  | 'in_vg'
  | 'unmapped'
  | 'clvmd'
  | 'size_mismatch'
  | 'scst_missing'
  | 'inconsistent'

export interface ClusterPvRow {
  nodeSanId: string
  nodeLabel: string
  path: string
  vgName: string
  sizeBytes: number
  status: ClusterRowStatus
  statusDetail?: string
  isPrimary: boolean
}

export interface ClusterVgRow {
  nodeSanId: string
  nodeLabel: string
  name: string
  sizeBytes: number
  freeBytes: number
  pvCount: number
  lvCount: number
  status: ClusterRowStatus
  statusDetail?: string
  isPrimary: boolean
}

export interface ClusterLvRow {
  nodeSanId: string
  nodeLabel: string
  path: string
  vgName: string
  name: string
  sizeBytes: number
  scst: string
  status: ClusterRowStatus
  statusDetail?: string
  isPrimary: boolean
}

export interface ClusterStepProgress {
  stepId: ProvisioningStepId
  ready: number
  total: number
  missingNodeLabels: string[]
  partialLabelKey: string
}

export interface ClusterNodeLvmSummary {
  sanId: string
  label: string
  sshReady: boolean
  pvCount: number
  vgCount: number
  lvCount: number
  error?: string
}

export interface ClusterLvmViewModel {
  degraded: boolean
  nodeCount: number
  connectedCount: number
  symmetryStatus: 'ok' | 'warning' | 'critical'
  issues: LocalSymmetricLvmIssue[]
  stepProgress: ClusterStepProgress[]
  nextAction: LvmNextAction
  chainSteps: ProvisioningStepView[]
  comparison: {
    pvRows: ClusterPvRow[]
    vgRows: ClusterVgRow[]
    lvRows: ClusterLvRow[]
  }
  nodes: ClusterNodeLvmSummary[]
  summaryCounts: { pv: string; vg: string; lv: string; scst: string }
}

export interface BuildClusterLvmViewModelInput {
  primarySanId: string
  nodes: ClusterLvmNodeInventory[]
  diskMappings?: ClusterLvmDiskMapping[]
  readOnly?: boolean
  /** Fallback when inventory not loaded */
  overview?: LvmOverviewResponse | null
  clusterPeers?: LvmNodeSnapshot[]
}

function resolveNodePvPath(
  primarySanId: string,
  sourcePath: string,
  node: ClusterLvmNodeInventory,
  mappings: ClusterLvmDiskMapping[],
): string {
  if (node.sanId === primarySanId) return sourcePath
  const mapped = mappings.find(m => m.sourcePath === sourcePath && m.peerSanId === node.sanId)
  if (mapped?.peerPath) return mapped.peerPath
  const cand = node.overview.candidates.find(c => c.path === sourcePath && c.eligible)
  if (cand) return sourcePath
  const md = node.mdArrays?.some(a => `/dev/${a.name}` === sourcePath || a.path === sourcePath)
  if (md) return sourcePath
  if (node.overview.pvs.some(p => p.path === sourcePath)) return sourcePath
  return ''
}

function inventoryToNodes(input: BuildClusterLvmViewModelInput): ClusterLvmNodeInventory[] {
  if (input.nodes.length) return input.nodes
  if (!input.overview) return []
  const primary: ClusterLvmNodeInventory = {
    sanId: input.primarySanId,
    label: 'local',
    role: null,
    readOnly: false,
    sshReady: true,
    overview: input.overview,
    mdArrayNames: [],
  }
  const peers: ClusterLvmNodeInventory[] = (input.clusterPeers ?? []).map(p => ({
    sanId: p.nodeSanId,
    label: p.nodeLabel,
    role: null,
    readOnly: false,
    sshReady: true,
    overview: {
      scannedAt: input.overview!.scannedAt,
      tools: input.overview!.tools,
      pvs: p.pvs,
      vgs: p.vgs,
      lvs: p.lvs,
      candidates: p.candidates ?? [],
      alerts: [],
    },
    mdArrayNames: [],
  }))
  return [primary, ...peers]
}

function expectedSourcePaths(
  primary: ClusterLvmNodeInventory,
  nodes: ClusterLvmNodeInventory[],
  mappings: ClusterLvmDiskMapping[],
): string[] {
  const fromPv = primary.overview.pvs.map(p => p.path)
  if (fromPv.length) return [...new Set(fromPv)]
  const eligible = primary.overview.candidates.filter(c => c.eligible)
  const preferred = eligible.find(c => c.kind === 'md' || c.kind === 'hw_raid_ld')
  if (preferred) return [preferred.path]
  if (eligible[0]) return [eligible[0].path]
  for (const n of nodes) {
    const c = n.overview.candidates.find(x => x.eligible && (x.kind === 'md' || x.kind === 'hw_raid_ld'))
    if (c) return [c.path]
  }
  return []
}

function expectedVgNames(primary: ClusterLvmNodeInventory, nodes: ClusterLvmNodeInventory[]): string[] {
  const names = new Set<string>()
  for (const v of primary.overview.vgs) if (!v.clustered) names.add(v.name)
  for (const n of nodes) {
    for (const v of n.overview.vgs) if (!v.clustered) names.add(v.name)
  }
  return [...names]
}

function expectedLvKeys(nodes: ClusterLvmNodeInventory[], vgNames: string[]): Array<{ vgName: string; name: string }> {
  const keys = new Map<string, { vgName: string; name: string }>()
  for (const vgName of vgNames) {
    for (const n of nodes) {
      for (const lv of n.overview.lvs.filter(l => l.vgName === vgName)) {
        keys.set(`${vgName}/${lv.name}`, { vgName, name: lv.name })
      }
    }
  }
  return [...keys.values()]
}

function nodeHasSource(
  node: ClusterLvmNodeInventory,
  primarySanId: string,
  sourcePath: string,
  mappings: ClusterLvmDiskMapping[],
): boolean {
  if (!node.sshReady) return false
  const path = resolveNodePvPath(primarySanId, sourcePath, node, mappings)
  if (!path) return false
  const cand = node.overview.candidates.find(c => c.path === path && c.eligible)
  const md = node.mdArrays?.some(a => `/dev/${a.name}` === path || a.path === path)
  const blk = node.blockDevices?.some(d => d.path === path)
  const pv = node.overview.pvs.some(p => p.path === path)
  if (cand || md || blk || pv) return true
  if (sourcePath && node.overview.pvs.some(p => p.path === sourcePath)) return true
  return false
}

function nodeHasPv(
  node: ClusterLvmNodeInventory,
  primarySanId: string,
  sourcePath: string,
  mappings: ClusterLvmDiskMapping[],
): boolean {
  if (!node.sshReady) return false
  const path = resolveNodePvPath(primarySanId, sourcePath, node, mappings)
  return path ? node.overview.pvs.some(p => p.path === path) : false
}

function countStep(
  nodes: ClusterLvmNodeInventory[],
  predicate: (n: ClusterLvmNodeInventory) => boolean,
): { ready: number; total: number; missingNodeLabels: string[] } {
  const total = nodes.length
  const missingNodeLabels: string[] = []
  let ready = 0
  for (const n of nodes) {
    if (!n.sshReady) {
      missingNodeLabels.push(n.label)
      continue
    }
    if (predicate(n)) ready++
    else missingNodeLabels.push(n.label)
  }
  return { ready, total, missingNodeLabels }
}

function buildStepProgress(
  nodes: ClusterLvmNodeInventory[],
  primary: ClusterLvmNodeInventory,
  primarySanId: string,
  mappings: ClusterLvmDiskMapping[],
): ClusterStepProgress[] {
  const sourcePaths = expectedSourcePaths(primary, nodes, mappings)
  const sourcePath = sourcePaths[0] ?? ''
  const vgNames = expectedVgNames(primary, nodes)
  const lvKeys = expectedLvKeys(nodes, vgNames)

  const source = countStep(nodes, n =>
    sourcePaths.some(sp => nodeHasSource(n, primarySanId, sp, mappings)),
  )
  const pv = sourcePath
    ? countStep(nodes, n => nodeHasPv(n, primarySanId, sourcePath, mappings))
    : { ready: 0, total: nodes.length, missingNodeLabels: nodes.map(n => n.label) }

  const vg = vgNames.length
    ? countStep(nodes, n => vgNames.some(name => n.overview.vgs.some(v => v.name === name && !v.clustered)))
    : countStep(nodes, n => false)

  const lv = lvKeys.length
    ? countStep(nodes, (n) => {
        return lvKeys.some(k => n.overview.lvs.some(l => l.vgName === k.vgName && l.name === k.name))
      })
    : countStep(nodes, n => false)

  const scst = lvKeys.length
    ? countStep(nodes, (n) => {
        return lvKeys.some((k) => {
          const lv = n.overview.lvs.find(l => l.vgName === k.vgName && l.name === k.name)
          return lv && (lv.scstDeviceNames?.length ?? 0) > 0
        })
      })
    : countStep(nodes, n => false)

  return [
    { stepId: 'source', ...source, partialLabelKey: 'lvm.cluster.view.progress.source_partial' },
    { stepId: 'pv', ...pv, partialLabelKey: 'lvm.cluster.view.progress.pv_partial' },
    { stepId: 'vg', ...vg, partialLabelKey: 'lvm.cluster.view.progress.vg_partial' },
    { stepId: 'lv', ...lv, partialLabelKey: 'lvm.cluster.view.progress.lv_partial' },
    { stepId: 'scst', ...scst, partialLabelKey: 'lvm.cluster.view.progress.scst_partial' },
  ]
}

function formatProgress(ready: number, total: number): string {
  return `${ready}/${total}`
}

export function buildClusterComparisonTables(
  nodes: ClusterLvmNodeInventory[],
  primarySanId: string,
  mappings: ClusterLvmDiskMapping[],
  issues: LocalSymmetricLvmIssue[],
): ClusterLvmViewModel['comparison'] {
  const pvRows: ClusterPvRow[] = []
  const vgRows: ClusterVgRow[] = []
  const lvRows: ClusterLvRow[] = []

  const sourcePaths = new Set<string>()
  const primary = nodes.find(n => n.sanId === primarySanId) ?? nodes[0]
  if (primary) {
    for (const p of primary.overview.pvs) sourcePaths.add(p.path)
    for (const c of primary.overview.candidates.filter(x => x.eligible)) sourcePaths.add(c.path)
  }

  for (const node of nodes) {
    if (!node.sshReady) {
      for (const sp of sourcePaths) {
        pvRows.push({
          nodeSanId: node.sanId,
          nodeLabel: node.label,
          path: resolveNodePvPath(primarySanId, sp, node, mappings) || sp,
          vgName: '—',
          sizeBytes: 0,
          status: 'ssh_down',
          statusDetail: node.error,
          isPrimary: node.sanId === primarySanId,
        })
      }
      continue
    }

    for (const pv of node.overview.pvs) {
      pvRows.push({
        nodeSanId: node.sanId,
        nodeLabel: node.label,
        path: pv.path,
        vgName: pv.vgName || '—',
        sizeBytes: pv.sizeBytes,
        status: pv.vgName ? 'in_vg' : 'ok',
        isPrimary: node.sanId === primarySanId,
      })
    }

    for (const vg of node.overview.vgs) {
      const issue = issues.find(i => i.vgName === vg.name)
      vgRows.push({
        nodeSanId: node.sanId,
        nodeLabel: node.label,
        name: vg.name,
        sizeBytes: vg.sizeBytes,
        freeBytes: vg.freeBytes,
        pvCount: vg.pvCount,
        lvCount: vg.lvCount,
        status: vg.clustered ? 'clvmd' : issue ? 'inconsistent' : 'ok',
        statusDetail: issue?.message,
        isPrimary: node.sanId === primarySanId,
      })
    }

    for (const lv of node.overview.lvs) {
      const issue = issues.find(i => i.vgName === lv.vgName && (i.lvName === lv.name || !i.lvName))
      const scst = lv.scstDeviceNames?.join(', ') ?? ''
      lvRows.push({
        nodeSanId: node.sanId,
        nodeLabel: node.label,
        path: lv.path,
        vgName: lv.vgName,
        name: lv.name,
        sizeBytes: lv.sizeBytes,
        scst,
        status: issue
          ? 'inconsistent'
          : scst
            ? 'ok'
            : 'scst_missing',
        statusDetail: issue?.message,
        isPrimary: node.sanId === primarySanId,
      })
    }
  }

  return { pvRows, vgRows, lvRows }
}

export function computeClusterLvmNextAction(
  ctx: LvmProvisioningContext,
  stepProgress: ClusterStepProgress[],
  nodes: ClusterLvmNodeInventory[],
  primarySanId: string,
): LvmNextAction {
  const base = computeLvmNextAction(ctx)

  const partial = (stepId: ProvisioningStepId) => {
    const sp = stepProgress.find(s => s.stepId === stepId)
    return sp && sp.ready > 0 && sp.ready < sp.total
  }

  if (partial('pv')) {
    const sp = stepProgress.find(s => s.stepId === 'pv')!
    const missing = sp.missingNodeLabels.join(', ')
    return {
      kind: 'blocked',
      messageKey: 'lvm.cluster.view.next.pv_partial',
      messageParams: { ready: String(sp.ready), total: String(sp.total), missing },
      actionLabelKey: 'lvm.provisioning.next.cta.create_pv',
      action: 'pv',
      nextStepId: 'pv',
    }
  }
  if (partial('vg')) {
    const sp = stepProgress.find(s => s.stepId === 'vg')!
    return {
      kind: 'blocked',
      messageKey: 'lvm.cluster.view.next.vg_partial',
      messageParams: { ready: String(sp.ready), total: String(sp.total), missing: sp.missingNodeLabels.join(', ') },
      actionLabelKey: 'lvm.provisioning.next.cta.create_vg',
      action: 'vg',
      nextStepId: 'vg',
    }
  }
  if (partial('source') && base.kind === 'create_pv') {
    const sp = stepProgress.find(s => s.stepId === 'source')!
    return {
      kind: 'blocked',
      messageKey: 'lvm.cluster.view.next.source_partial',
      messageParams: { ready: String(sp.ready), total: String(sp.total), missing: sp.missingNodeLabels.join(', ') },
      actionLabelKey: 'lvm.provisioning.next.cta.create_pv',
      action: 'pv',
      nextStepId: 'source',
    }
  }

  const allPvReady = stepProgress.find(s => s.stepId === 'pv')
  if (allPvReady && allPvReady.ready === allPvReady.total && allPvReady.total > 0 && ctx.vgs.length === 0) {
    const orphan = ctx.orphanPvs[0]
    return {
      kind: 'create_vg',
      messageKey: 'lvm.provisioning.next.create_vg',
      messageParams: { path: orphan?.path ?? '' },
      actionLabelKey: 'lvm.provisioning.next.cta.create_vg',
      action: 'vg',
      targetPath: orphan?.path,
      nextStepId: 'vg',
    }
  }

  if (partial('lv') || partial('scst')) {
    return base
  }

  return base
}

export function mergeClusterProvisioningChain(
  localSteps: ProvisioningStepView[],
  stepProgress: ClusterStepProgress[],
): ProvisioningStepView[] {
  return localSteps.map((step) => {
    const sp = stepProgress.find(p => p.stepId === step.id)
    if (!sp) return step
    const complete = sp.ready >= sp.total && sp.total > 0
    const partial = sp.ready > 0 && sp.ready < sp.total
    return {
      ...step,
      detail: formatProgress(sp.ready, sp.total),
      clusterProgress: { ready: sp.ready, total: sp.total, labelKey: sp.partialLabelKey },
      count: sp.ready,
      hintKey: partial ? sp.partialLabelKey : step.hintKey,
      status: partial
        ? 'missing'
        : complete
          ? 'created'
          : step.status,
    }
  })
}

export function buildClusterLvmViewModel(input: BuildClusterLvmViewModelInput): ClusterLvmViewModel | null {
  const nodes = inventoryToNodes(input)
  if (!nodes.length) return null

  const mappings = input.diskMappings ?? []
  const primary = nodes.find(n => n.sanId === input.primarySanId) ?? nodes[0]
  const peers: LvmNodeSnapshot[] = nodes
    .filter(n => n.sanId !== input.primarySanId)
    .map(n => ({
      nodeSanId: n.sanId,
      nodeLabel: n.label,
      pvs: n.overview.pvs,
      vgs: n.overview.vgs,
      lvs: n.overview.lvs,
    }))

  const allNodesForSymmetry = nodes.map(n => ({
    nodeLabel: n.label,
    vgs: n.overview.vgs,
    lvs: n.overview.lvs,
  }))

  const issues = assessClusterSymmetricLvm(
    {
      nodeLabel: primary.label,
      pvs: primary.overview.pvs,
      vgs: primary.overview.vgs,
      lvs: primary.overview.lvs,
    },
    peers,
    allNodesForSymmetry,
  )

  const symmetryStatus = issues.some(i => i.severity === 'critical')
    ? 'critical'
    : issues.length
      ? 'warning'
      : 'ok'

  const stepProgress = buildStepProgress(nodes, primary, input.primarySanId, mappings)
  const connectedCount = nodes.filter(n => n.sshReady).length

  const primaryCandidates = primary.overview.candidates.filter(c => c.eligible)
  const ctx: LvmProvisioningContext = {
    candidates: primaryCandidates,
    pvs: primary.overview.pvs,
    vgs: primary.overview.vgs,
    lvs: primary.overview.lvs,
    orphanPvs: primary.overview.pvs.filter(p => !p.vgName),
    readOnly: input.readOnly,
    symmetryIssues: issues,
  }

  const nextAction = computeClusterLvmNextAction(ctx, stepProgress, nodes, input.primarySanId)
  const localChain = buildProvisioningChain(ctx)
  const chainSteps = mergeClusterProvisioningChain(localChain, stepProgress)

  const comparison = buildClusterComparisonTables(nodes, input.primarySanId, mappings, issues)

  const summaryCounts = {
    pv: formatProgress(stepProgress.find(s => s.stepId === 'pv')!.ready, stepProgress.find(s => s.stepId === 'pv')!.total),
    vg: formatProgress(stepProgress.find(s => s.stepId === 'vg')!.ready, stepProgress.find(s => s.stepId === 'vg')!.total),
    lv: formatProgress(stepProgress.find(s => s.stepId === 'lv')!.ready, stepProgress.find(s => s.stepId === 'lv')!.total),
    scst: formatProgress(stepProgress.find(s => s.stepId === 'scst')!.ready, stepProgress.find(s => s.stepId === 'scst')!.total),
  }

  return {
    degraded: !input.nodes.length,
    nodeCount: nodes.length,
    connectedCount,
    symmetryStatus,
    issues,
    stepProgress,
    nextAction,
    chainSteps,
    comparison,
    nodes: nodes.map(n => ({
      sanId: n.sanId,
      label: n.label,
      sshReady: n.sshReady,
      pvCount: n.overview.pvs.length,
      vgCount: n.overview.vgs.length,
      lvCount: n.overview.lvs.length,
      error: n.error,
    })),
    summaryCounts,
  }
}
