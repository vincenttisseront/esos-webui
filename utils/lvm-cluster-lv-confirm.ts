import type {
  ClusterLvmExecutionPlan,
  ClusterLvmNodeInventory,
  ClusterLvmPreflightResult,
} from '~/types/lvm'

export type LvConfirmCheck = {
  id: string
  ok: boolean
  detail?: string
}

function blockerMatches(blockers: string[], pattern: RegExp): string | undefined {
  return blockers.find(b => pattern.test(b))
}

export function extractLvExistsBlockers(blockers: string[]): string[] {
  return blockers.filter(b => /LV [\w.-]+\/[\w.-]+ existe déjà|existe déjà/i.test(b))
}

export function extractVgMissingBlockers(blockers: string[]): string[] {
  return blockers.filter(b => /VG .+ absent|introuvable/i.test(b))
}

export function buildClusterLvConfirmChecks(input: {
  vgName: string
  lvName: string
  sizeBytes: number
  preflight: ClusterLvmPreflightResult | null
  plan: ClusterLvmExecutionPlan | null
}): LvConfirmCheck[] {
  const nodes = input.preflight?.nodes ?? []
  const blockers = [
    ...(input.preflight?.blockers ?? []),
    ...(input.plan?.blockers ?? []),
  ]
  const readyNodes = nodes.filter(n => n.sshReady)

  const lvExistsDetail = extractLvExistsBlockers(blockers).join(' · ')
  const vgMissingDetail = extractVgMissingBlockers(blockers).join(' · ')
  const spaceDetail = blockers.filter(b => /Espace insuffisant|espace libre|dépasse/i.test(b)).join(' · ')
    || readyNodes
      .filter((node) => {
        const vg = node.overview.vgs.find(v => v.name === input.vgName && !v.clustered)
        return vg && vg.freeBytes < input.sizeBytes
      })
      .map(n => n.label)
      .join(', ')

  const vgOnAllNodes = readyNodes.length > 0 && readyNodes.every((node) => {
    const vg = node.overview.vgs.find(v => v.name === input.vgName && !v.clustered)
    return !!vg
  })

  const lvAbsentAll = readyNodes.length > 0 && readyNodes.every((node) =>
    !node.overview.lvs.some(l => l.vgName === input.vgName && l.name === input.lvName),
  )

  const spaceOk = readyNodes.length > 0 && readyNodes.every((node) => {
    const vg = node.overview.vgs.find(v => v.name === input.vgName && !v.clustered)
    return vg && vg.freeBytes >= input.sizeBytes
  })

  const perNodeFree = readyNodes.map((node: ClusterLvmNodeInventory) => {
    const vg = node.overview.vgs.find(v => v.name === input.vgName && !v.clustered)
    const free = vg?.freeBytes ?? 0
    return `${node.label}: ${formatBytesShort(free)}`
  })

  const executeNodes = input.plan?.nodeResults.filter(n => n.participation === 'execute') ?? []
  const toolsOk = readyNodes.every(n => n.overview.tools.lvcreate)

  return [
    {
      id: 'vg_exists_each_node',
      ok: vgOnAllNodes && !vgMissingDetail,
      detail: vgMissingDetail || perNodeFree.join(' · ') || undefined,
    },
    {
      id: 'lv_not_exists',
      ok: lvAbsentAll && !lvExistsDetail,
      detail: lvExistsDetail || undefined,
    },
    {
      id: 'free_space_each_node',
      ok: spaceOk && !spaceDetail,
      detail: spaceDetail || (!spaceOk ? perNodeFree.join(' · ') : undefined),
    },
    {
      id: 'tools_lvcreate',
      ok: toolsOk,
      detail: toolsOk ? undefined : readyNodes.filter(n => !n.overview.tools.lvcreate).map(n => n.label).join(', '),
    },
    {
      id: 'plan_execute',
      ok: !!input.plan?.okSymmetric && executeNodes.length === readyNodes.length,
      detail: executeNodes.map(n => n.label).join(', ') || undefined,
    },
  ]
}

export function clusterLvConfirmBlocked(checks: LvConfirmCheck[], plan: ClusterLvmExecutionPlan | null): boolean {
  return checks.some(c => !c.ok) || !plan?.okSymmetric
}

function formatBytesShort(n: number): string {
  if (!n) return '0 B'
  const u = ['B', 'KiB', 'MiB', 'GiB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${u[i]}`
}
