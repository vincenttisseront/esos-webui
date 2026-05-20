import type {
  ClusterLvmDiskMapping,
  ClusterLvmExecutionPlan,
  ClusterLvmNodeInventory,
  ClusterLvmPreflightResult,
} from '~/types/lvm'

export type VgConfirmCheck = {
  id: string
  ok: boolean
  detail?: string
}

function resolveNodePvPaths(
  node: ClusterLvmNodeInventory,
  primarySanId: string,
  pvPaths: string[],
  mappings: ClusterLvmDiskMapping[],
): string[] {
  if (node.sanId === primarySanId) return pvPaths
  return pvPaths.map((sourcePath) => {
    const m = mappings.find(x => x.sourcePath === sourcePath && x.peerSanId === node.sanId)
    return m?.peerPath ?? ''
  }).filter(Boolean)
}

function blockerMatches(blockers: string[], pattern: RegExp): string | undefined {
  return blockers.find(b => pattern.test(b))
}

export function extractVgExistsBlockers(blockers: string[]): string[] {
  return blockers.filter(b => /VG .+ existe déjà|existe déjà/i.test(b))
}

export function buildClusterVgConfirmChecks(input: {
  vgName: string
  pvPaths: string[]
  primarySanId: string
  mappings: ClusterLvmDiskMapping[]
  preflight: ClusterLvmPreflightResult | null
  plan: ClusterLvmExecutionPlan | null
}): VgConfirmCheck[] {
  const nodes = input.preflight?.nodes ?? []
  const blockers = [
    ...(input.preflight?.blockers ?? []),
    ...(input.plan?.blockers ?? []),
  ]
  const readyNodes = nodes.filter(n => n.sshReady)

  const vgExistsDetail = extractVgExistsBlockers(blockers).join(' · ')
  const pvMissingDetail = blockers.filter(b => /PV introuvable|non mappé/i.test(b)).join(' · ')
  const pvInVgDetail = blockers.filter(b => /appartient déjà au VG/i.test(b)).join(' · ')
  const sizeDetail = blockerMatches(blockers, /Tailles incohérentes|taille/i)

  const perNodePv = readyNodes.map((node) => {
    const paths = resolveNodePvPaths(node, input.primarySanId, input.pvPaths, input.mappings)
    return { label: node.label, paths }
  })

  const pvExistsAll = perNodePv.length > 0 && perNodePv.every((row) => {
    const node = readyNodes.find(n => n.label === row.label)
    if (!node) return false
    return row.paths.every((path) => {
      const pv = node.overview.pvs.find(p => p.path === path)
      return !!pv
    })
  })

  const pvFreeAll = pvExistsAll && !pvInVgDetail && perNodePv.every((row) => {
    const node = readyNodes.find(n => n.label === row.label)
    if (!node) return false
    return row.paths.every((path) => {
      const pv = node.overview.pvs.find(p => p.path === path)
      return pv && !pv.vgName
    })
  })

  const executeNodes = input.plan?.nodeResults.filter(n => n.participation === 'execute') ?? []
  const toolsOk = readyNodes.every(n => n.overview.tools.vgcreate)

  return [
    {
      id: 'vg_not_exists',
      ok: !vgExistsDetail,
      detail: vgExistsDetail || undefined,
    },
    {
      id: 'pv_exists_each_node',
      ok: pvExistsAll && !pvMissingDetail,
      detail: perNodePv.map(r => `${r.label}: ${r.paths.join(', ') || '—'}`).join(' · ') || undefined,
    },
    {
      id: 'pv_free_not_in_vg',
      ok: pvFreeAll,
      detail: pvInVgDetail || undefined,
    },
    {
      id: 'size_compatible',
      ok: !sizeDetail,
      detail: sizeDetail,
    },
    {
      id: 'tools_vgcreate',
      ok: toolsOk,
      detail: toolsOk ? undefined : readyNodes.filter(n => !n.overview.tools.vgcreate).map(n => n.label).join(', '),
    },
    {
      id: 'plan_execute',
      ok: !!input.plan?.okSymmetric && executeNodes.length === readyNodes.length,
      detail: executeNodes.map(n => n.label).join(', ') || undefined,
    },
  ]
}

export function clusterVgConfirmBlocked(checks: VgConfirmCheck[], plan: ClusterLvmExecutionPlan | null): boolean {
  return checks.some(c => !c.ok) || !plan?.okSymmetric
}
