import type {
  ClusterLvmDiskMapping,
  ClusterLvmExecutionPlan,
  ClusterLvmNodeInventory,
  ClusterLvmPreflightResult,
} from '~/types/lvm'

export type PvConfirmCheck = {
  id: string
  ok: boolean
  detail?: string
}

function nodePath(
  node: ClusterLvmNodeInventory,
  primarySanId: string,
  sourcePath: string,
  mappings: ClusterLvmDiskMapping[],
): string | undefined {
  if (node.sanId === primarySanId) return sourcePath
  return mappings.find(m => m.sourcePath === sourcePath && m.peerSanId === node.sanId)?.peerPath
}

function blockerMatches(blockers: string[], pattern: RegExp): string | undefined {
  return blockers.find(b => pattern.test(b))
}

export function buildClusterPvConfirmChecks(input: {
  primarySanId: string
  sourcePath: string
  force: boolean
  mappings: ClusterLvmDiskMapping[]
  preflight: ClusterLvmPreflightResult | null
  plan: ClusterLvmExecutionPlan | null
  labels: Record<string, string>
}): PvConfirmCheck[] {
  const nodes = input.preflight?.nodes ?? []
  const blockers = [
    ...(input.preflight?.blockers ?? []),
    ...(input.plan?.blockers ?? []),
  ]
  const readyNodes = nodes.filter(n => n.sshReady)
  const paths = readyNodes.map(n => ({
    label: n.label,
    path: nodePath(n, input.primarySanId, input.sourcePath, input.mappings),
  }))

  const allExist = paths.length > 0 && paths.every((p) => {
    if (!p.path) return false
    const node = readyNodes.find(n => n.label === p.label)
    if (!node) return false
    const cand = node.overview.candidates.find(c => c.path === p.path)
    const md = node.mdArrays?.some(a => a.path === p.path || `/dev/${a.name}` === p.path)
    const blk = node.blockDevices?.some(d => d.path === p.path)
    return !!(cand || md || blk)
  })

  const pvExistsDetail = blockers
    .filter(b => /PV déjà présent|Déjà volume physique/i.test(b))
    .join(' · ')

  const sizeDetail = blockerMatches(blockers, /Tailles incohérentes/i)
  const mountedDetail = blockers.filter(b => /monté/i.test(b)).join(' · ')
  const scstDetail = blockers.filter(b => /SCST/i.test(b)).join(' · ')
  const vgDetail = blockers.filter(b => /VG /i.test(b) && /appartient/i.test(b)).join(' · ')
  const sigDetail = blockers.filter(b => /signature|fichiers|wipefs|force requis/i.test(b)).join(' · ')

  const executeNodes = input.plan?.nodeResults.filter(n => n.participation === 'execute') ?? []
  const toolsOk = readyNodes.every(n => n.overview.tools.pvcreate)

  return [
    {
      id: 'device_exists',
      ok: allExist && !blockerMatches(blockers, /introuvable|non mappé/i),
      detail: paths.map(p => `${p.label}: ${p.path ?? '—'}`).join(' · ') || undefined,
    },
    {
      id: 'size_compatible',
      ok: !sizeDetail,
      detail: sizeDetail,
    },
    {
      id: 'not_mounted',
      ok: !mountedDetail,
      detail: mountedDetail || undefined,
    },
    {
      id: 'not_already_pv',
      ok: !pvExistsDetail,
      detail: pvExistsDetail || undefined,
    },
    {
      id: 'not_in_vg',
      ok: !vgDetail,
      detail: vgDetail || undefined,
    },
    {
      id: 'not_scst',
      ok: !scstDetail,
      detail: scstDetail || undefined,
    },
    {
      id: 'no_signature',
      ok: input.force ? true : !sigDetail,
      detail: input.force
        ? input.labels.force_acknowledged
        : sigDetail || undefined,
    },
    {
      id: 'tools_pvcreate',
      ok: toolsOk,
      detail: toolsOk ? undefined : readyNodes.filter(n => !n.overview.tools.pvcreate).map(n => n.label).join(', '),
    },
    {
      id: 'plan_execute',
      ok: !!input.plan?.okSymmetric && executeNodes.length === readyNodes.length,
      detail: executeNodes.map(n => n.label).join(', ') || undefined,
    },
  ]
}

export function clusterPvConfirmBlocked(checks: PvConfirmCheck[], plan: ClusterLvmExecutionPlan | null): boolean {
  return checks.some(c => !c.ok) || !plan?.okSymmetric
}
