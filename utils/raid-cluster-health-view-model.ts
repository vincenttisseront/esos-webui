import type {
  MdArray,
  MdDetectionItem,
  MdDetectionSummary,
  RaidActionableCategory,
  RaidActionableItem,
  RaidActionTarget,
  RaidClusterArrayMainStatus,
  RaidClusterHealthSummary,
  RaidClusterHealthViewModel,
  RaidCockpitHealth,
  RaidGroupedActionableItem,
  RaidOverviewResponse,
  RaidProductionImpact,
  RaidTechnicalDetail,
} from '~/types/raid'
import { isAttentionItem, sortAttentionItems } from '~/utils/raid-md-detection'
import { hasActiveMdArrayProgress, primaryResyncSummary } from '~/utils/raid-md-progress'

export type RaidCockpitTranslate = (
  key: string,
  params?: Record<string, string | number>,
) => string

function arrayNameFromPath(path: string): string {
  return path.replace(/^\/dev\//, '')
}

function activeKernelNames(summary: MdDetectionSummary | undefined): Set<string> {
  const names = new Set<string>()
  if (!summary) return names
  for (const item of summary.items) {
    if (item.kind === 'active_kernel') {
      names.add(arrayNameFromPath(item.path))
    }
  }
  return names
}

function detectClusterAsymmetry(
  localArrays: MdArray[],
  clusterPeers: MdDetectionSummary[],
  currentSanId: string,
): { critical: boolean; details: string[] } {
  const details: string[] = []
  const localActive = new Set(localArrays.map(a => a.name))
  const localDetection: MdDetectionSummary = {
    nodeSanId: currentSanId,
    nodeLabel: '',
    hasAnyMdState: true,
    items: localArrays.map(arr => ({
      kind: 'active_kernel' as const,
      path: arr.path,
      nodeSanId: currentSanId,
      nodeLabel: '',
      severity: 'info' as const,
      summary: '',
      reasons: [],
      uiAnchor: 'software-active' as const,
      relatedArrayPath: arr.path,
    })),
  }
  const localNames = activeKernelNames(localDetection)
  for (const name of localActive) localNames.add(name)

  let critical = false
  for (const peer of clusterPeers) {
    if (peer.nodeSanId === currentSanId) continue
    const peerActive = activeKernelNames(peer)
    for (const name of localNames) {
      if (!peerActive.has(name)) {
        critical = true
        details.push(`${name}: actif sur ce nœud, absent ou arrêté sur ${peer.nodeLabel}`)
      }
    }
    for (const name of peerActive) {
      if (!localNames.has(name)) {
        critical = true
        details.push(`${name}: actif sur ${peer.nodeLabel}, absent sur ce nœud`)
      }
    }
  }
  return { critical, details }
}

function mainArrayStatus(mdArrays: MdArray[]): RaidClusterArrayMainStatus {
  if (!mdArrays.length) return 'none'
  if (mdArrays.some(a => hasActiveMdArrayProgress(a) || a.state === 'resync' || a.state === 'recovering')) {
    return 'resync'
  }
  if (mdArrays.some(a => a.state === 'degraded' || a.state === 'failed')) return 'degraded'
  if (mdArrays.every(a => a.state === 'clean')) return 'clean'
  if (mdArrays.some(a => a.state === 'active' || a.state === 'clean')) return 'active'
  return 'unknown'
}

function actionTargetFromItem(item: MdDetectionItem): RaidActionTarget {
  if (item.recommendedAction === 'zero_superblock') {
    return { type: 'devices', tab: 'devices', path: item.path, sanId: item.nodeSanId }
  }
  if (item.recommendedAction === 'assemble') {
    return { type: 'scroll', tab: 'software', anchor: 'raid-software-stopped-assemblable', path: item.path }
  }
  if (item.uiAnchor === 'software-active' && item.relatedArrayPath) {
    return { type: 'scroll', tab: 'software', anchor: 'raid-software-active', path: item.relatedArrayPath }
  }
  if (item.nodeSanId) {
    return { type: 'navigate', tab: 'software', sanId: item.nodeSanId, path: item.path }
  }
  return { type: 'scroll', tab: 'software', path: item.path }
}

function interpretLocalItem(
  item: MdDetectionItem,
  t: RaidCockpitTranslate,
): RaidActionableItem | null {
  if (item.kind === 'partition_metadata') {
    return {
      id: `metadata_local:${item.path}`,
      severity: 'warning',
      category: 'metadata_local',
      title: t('raid.cockpit.item.metadata_local.title'),
      impact: t('raid.cockpit.item.metadata_local.impact'),
      recommendation: t('raid.cockpit.item.metadata_local.recommendation'),
      primaryActionLabel: t('raid.cockpit.item.metadata_local.action'),
      primaryActionTarget: actionTargetFromItem(item),
      details: [item.summary, ...item.reasons],
    }
  }
  if (item.kind === 'stopped_examine' && item.recommendedAction === 'zero_superblock') {
    return {
      id: `metadata_orphan:${item.path}`,
      severity: 'warning',
      category: 'metadata_orphan',
      title: t('raid.cockpit.item.metadata_orphan.title'),
      impact: t('raid.cockpit.item.metadata_orphan.impact'),
      recommendation: t('raid.cockpit.item.metadata_orphan.recommendation'),
      primaryActionLabel: t('raid.cockpit.item.metadata_orphan.action'),
      primaryActionTarget: actionTargetFromItem(item),
      details: [item.summary, ...item.reasons],
    }
  }
  if (item.kind === 'stopped_scan' || (item.kind === 'stopped_examine' && item.recommendedAction === 'assemble')) {
    return {
      id: `array_stopped:${item.path}`,
      severity: 'warning',
      category: 'array_stopped',
      title: t('raid.cockpit.item.array_stopped.title'),
      impact: t('raid.cockpit.item.array_stopped.impact'),
      recommendation: t('raid.cockpit.item.array_stopped.recommendation'),
      primaryActionLabel: t('raid.cockpit.item.array_stopped.action'),
      primaryActionTarget: actionTargetFromItem(item),
      details: [item.summary, ...item.reasons],
    }
  }
  if (item.kind === 'block_device_raid') {
    return {
      id: `array_inactive:${item.path}`,
      severity: 'warning',
      category: 'array_inactive',
      title: t('raid.cockpit.item.array_inactive.title'),
      impact: t('raid.cockpit.item.array_inactive.impact'),
      recommendation: t('raid.cockpit.item.array_inactive.recommendation'),
      primaryActionLabel: t('raid.cockpit.item.array_inactive.action'),
      primaryActionTarget: actionTargetFromItem(item),
      details: [item.summary, ...item.reasons],
    }
  }
  if (item.kind === 'active_kernel' && (item.severity === 'warning' || item.summary.includes('degraded'))) {
    return {
      id: `array_degraded:${item.path}`,
      severity: 'warning',
      category: 'array_degraded',
      title: t('raid.cockpit.item.array_degraded.title'),
      impact: t('raid.cockpit.item.array_degraded.impact'),
      recommendation: t('raid.cockpit.item.array_degraded.recommendation'),
      primaryActionLabel: t('raid.cockpit.item.array_degraded.action'),
      primaryActionTarget: actionTargetFromItem(item),
      details: [item.summary, ...item.reasons],
    }
  }
  return null
}

function buildPeerMetadataItems(
  clusterPeers: MdDetectionSummary[],
  currentSanId: string,
  t: RaidCockpitTranslate,
): RaidActionableItem[] {
  const items: RaidActionableItem[] = []
  for (const peer of clusterPeers) {
    if (peer.nodeSanId === currentSanId) continue
    const metaItems = peer.items.filter(i => i.kind === 'partition_metadata')
    if (!metaItems.length) continue
    const details = metaItems.flatMap(i => [`${i.path}: ${i.summary}`, ...i.reasons])
    items.push({
      id: `metadata_peer:${peer.nodeSanId}`,
      severity: 'warning',
      category: 'metadata_peer',
      title: t('raid.cockpit.item.metadata_peer.title', { label: peer.nodeLabel }),
      impact: t('raid.cockpit.item.metadata_peer.impact'),
      recommendation: t('raid.cockpit.item.metadata_peer.recommendation'),
      primaryActionLabel: t('raid.cockpit.item.metadata_peer.action', { label: peer.nodeLabel }),
      primaryActionTarget: { type: 'navigate', tab: 'software', sanId: peer.nodeSanId },
      details,
    })
  }
  return items
}

function buildResyncItem(
  mdArrays: MdArray[],
  t: RaidCockpitTranslate,
): RaidActionableItem | null {
  const resync = primaryResyncSummary(mdArrays)
  if (!resync) return null
  return {
    id: `resync:${resync.path}`,
    severity: 'info',
    category: 'resync',
    title: t('raid.cockpit.item.resync.title'),
    impact: t('raid.cockpit.item.resync.impact'),
    recommendation: t('raid.cockpit.item.resync.recommendation'),
    primaryActionLabel: t('raid.cockpit.item.resync.action'),
    primaryActionTarget: { type: 'scroll', tab: 'software', anchor: 'raid-software-active', path: resync.path },
    details: [`${resync.path} ${resync.action} ${resync.percent.toFixed(1)}%`],
  }
}

function buildTechnicalDetails(
  overview: RaidOverviewResponse,
  clusterPeers: MdDetectionSummary[],
): RaidTechnicalDetail[] {
  const details: RaidTechnicalDetail[] = []
  for (const item of overview.mdDetection?.items ?? []) {
    details.push({
      id: `local:${item.path}:${item.kind}`,
      label: item.path,
      lines: [item.summary, ...item.reasons, `kind=${item.kind}`, item.recommendedAction ? `action=${item.recommendedAction}` : ''].filter(Boolean),
    })
  }
  for (const peer of clusterPeers) {
    for (const item of peer.items) {
      details.push({
        id: `peer:${peer.nodeSanId}:${item.path}:${item.kind}`,
        label: `${peer.nodeLabel} — ${item.path}`,
        lines: [item.summary, ...item.reasons],
      })
    }
  }
  for (const arr of overview.mdArrays) {
    const lines = [
      `state=${arr.state}`,
      arr.uuid ? `uuid=${arr.uuid}` : '',
      arr.detailState ? `mdadm=${arr.detailState}` : '',
      ...arr.warnings,
    ].filter(Boolean)
    details.push({ id: `array:${arr.path}`, label: arr.path, lines })
  }
  return details
}

function deriveHealth(actionable: RaidActionableItem[]): RaidCockpitHealth {
  if (actionable.some(a => a.severity === 'critical')) return 'critical'
  if (actionable.some(a => a.severity === 'warning')) return 'warning'
  if (actionable.some(a => a.severity === 'info')) return 'warning'
  return 'healthy'
}

function deriveProductionImpact(
  health: RaidCockpitHealth,
  mdArrays: MdArray[],
  summary: RaidClusterHealthSummary,
): RaidProductionImpact {
  if (health === 'critical' || summary.peerConsistencyStatus === 'critical') return 'unavailable'
  if (health === 'warning' || summary.resyncStatus === 'in_progress') return 'degraded'
  if (!mdArrays.length && summary.activeArraysCount === 0) return 'unknown'
  return 'none'
}

function buildHeadline(
  health: RaidCockpitHealth,
  actionableCount: number,
  t: RaidCockpitTranslate,
): string {
  if (health === 'healthy') return t('raid.cockpit.headline.no_attention')
  if (health === 'critical') return t('raid.cockpit.headline.critical')
  return t('raid.cockpit.headline.actions', { count: actionableCount })
}

function actionTargetGroupKey(target?: RaidActionTarget): string {
  if (!target) return ''
  const { path: _path, ...rest } = target
  return JSON.stringify(rest)
}

function extractPathsFromItem(item: RaidActionableItem): string[] {
  const paths = new Set<string>()
  if (item.primaryActionTarget?.path?.startsWith('/dev/')) {
    paths.add(item.primaryActionTarget.path)
  }
  for (const line of item.details) {
    const m = line.match(/^(\/dev\/\S+)/)
    if (m) paths.add(m[1])
  }
  return [...paths]
}

function mergeSeverity(
  a: RaidActionableItem['severity'],
  b: RaidActionableItem['severity'],
): RaidActionableItem['severity'] {
  const rank = { critical: 0, warning: 1, info: 2 }
  return rank[a] <= rank[b] ? a : b
}

function pluralizeGroupedImpact(
  category: RaidActionableCategory,
  count: number,
  impact: string,
  t: RaidCockpitTranslate,
): string {
  if (count > 1 && category === 'metadata_local') {
    return t('raid.cockpit.item.metadata_local.impact_plural')
  }
  return impact
}

export function groupRaidActionableItems(
  items: RaidActionableItem[],
  t: RaidCockpitTranslate,
): RaidGroupedActionableItem[] {
  const map = new Map<string, RaidGroupedActionableItem>()

  for (const item of prioritySortActionable(items)) {
    const groupKey = [
      item.category,
      item.title,
      item.primaryActionLabel ?? '',
      actionTargetGroupKey(item.primaryActionTarget),
    ].join('|')

    const paths = extractPathsFromItem(item)
    const existing = map.get(groupKey)
    if (!existing) {
      map.set(groupKey, {
        groupKey,
        severity: item.severity,
        title: item.title,
        impact: item.impact,
        recommendation: item.recommendation,
        affectedPaths: paths,
        primaryActionLabel: item.primaryActionLabel,
        primaryActionTarget: item.primaryActionTarget,
        representative: item,
      })
      continue
    }

    existing.severity = mergeSeverity(existing.severity, item.severity)
    for (const p of paths) {
      if (!existing.affectedPaths.includes(p)) existing.affectedPaths.push(p)
    }
  }

  return [...map.values()].map((g) => ({
    ...g,
    impact: pluralizeGroupedImpact(
      g.representative.category,
      g.affectedPaths.length,
      g.impact,
      t,
    ),
  }))
}

export function formatAffectedPaths(
  paths: string[],
  t: RaidCockpitTranslate,
): string {
  const joined = paths.join(', ')
  if (paths.length <= 1) return t('raid.cockpit.affected.single', { paths: joined })
  return t('raid.cockpit.affected.multiple', { count: paths.length, paths: joined })
}

export function buildRaidClusterHealthViewModel(input: {
  overview: RaidOverviewResponse | null
  currentSanId: string
  isClustered: boolean
  t: RaidCockpitTranslate
}): RaidClusterHealthViewModel {
  const { overview, currentSanId, isClustered, t } = input

  if (!overview) {
    return {
      health: 'unknown',
      productionImpact: 'unknown',
      headline: t('raid.cockpit.headline.unknown'),
      summary: {
        activeArraysCount: 0,
        activeArrayMainStatus: 'unknown',
        connectedNodes: 0,
        totalNodes: 0,
        resyncStatus: 'unknown',
        peerConsistencyStatus: 'unknown',
      },
      actionableItems: [],
      technicalDetails: [],
    }
  }

  const mdArrays = overview.mdArrays ?? []
  const clusterPeers = overview.clusterMdDetection ?? []
  const localItems = sortAttentionItems(
    (overview.mdDetection?.items ?? []).filter(i => i.nodeSanId === currentSanId || !i.nodeSanId),
  )

  const actionableItems: RaidActionableItem[] = []
  const seenIds = new Set<string>()

  function push(item: RaidActionableItem | null) {
    if (!item || seenIds.has(item.id)) return
    seenIds.add(item.id)
    actionableItems.push(item)
  }

  if (isClustered && clusterPeers.length) {
    const asym = detectClusterAsymmetry(mdArrays, clusterPeers, currentSanId)
    if (asym.critical) {
      push({
        id: 'cluster_asymmetry',
        severity: 'critical',
        category: 'cluster_asymmetry',
        title: t('raid.cockpit.item.cluster_asymmetry.title'),
        impact: t('raid.cockpit.item.cluster_asymmetry.impact'),
        recommendation: t('raid.cockpit.item.cluster_asymmetry.recommendation'),
        primaryActionLabel: t('raid.cockpit.item.cluster_asymmetry.action'),
        primaryActionTarget: { type: 'scroll', tab: 'software', anchor: 'raid-software-active' },
        details: asym.details,
      })
    }
  }

  for (const item of localItems.filter(isAttentionItem)) {
    if (item.kind === 'active_kernel') continue
    push(interpretLocalItem({ ...item, nodeSanId: item.nodeSanId || currentSanId, nodeLabel: item.nodeLabel || '' }, t))
  }

  for (const arr of mdArrays) {
    if (arr.state === 'degraded' || arr.state === 'failed' || arr.failedDevices > 0) {
      push({
        id: `array_degraded:${arr.path}`,
        severity: arr.state === 'failed' ? 'critical' : 'warning',
        category: 'array_degraded',
        title: t('raid.cockpit.item.array_degraded.title'),
        impact: t('raid.cockpit.item.array_degraded.impact'),
        recommendation: t('raid.cockpit.item.array_degraded.recommendation'),
        primaryActionLabel: t('raid.cockpit.item.array_degraded.action'),
        primaryActionTarget: { type: 'scroll', tab: 'software', anchor: 'raid-software-active', path: arr.path },
        details: [`${arr.path} (${arr.state})`, ...arr.warnings],
      })
    }
  }

  if (isClustered) {
    for (const peerItem of buildPeerMetadataItems(clusterPeers, currentSanId, t)) {
      push(peerItem)
    }
  }

  const resyncItem = buildResyncItem(mdArrays, t)
  const hasBlocking = actionableItems.some(a => a.severity !== 'info')
  if (resyncItem && hasBlocking) {
    push(resyncItem)
  }

  const totalNodes = isClustered ? 1 + clusterPeers.length : 1
  const connectedNodes = isClustered
    ? 1 + clusterPeers.filter(p => p.hasAnyMdState || p.items.length > 0).length
    : 1

  const asym = isClustered ? detectClusterAsymmetry(mdArrays, clusterPeers, currentSanId) : { critical: false, details: [] }
  const peerConsistencyStatus: RaidClusterHealthSummary['peerConsistencyStatus'] =
    !isClustered ? 'unknown'
      : asym.critical ? 'critical'
        : actionableItems.some(a => a.category === 'metadata_peer') ? 'warning'
          : 'ok'

  const resyncStatus: RaidClusterHealthSummary['resyncStatus'] =
    primaryResyncSummary(mdArrays) ? 'in_progress' : 'none'

  const summary: RaidClusterHealthSummary = {
    activeArraysCount: mdArrays.length,
    activeArrayMainStatus: mainArrayStatus(mdArrays),
    connectedNodes,
    totalNodes,
    resyncStatus,
    peerConsistencyStatus,
  }

  const health = deriveHealth(actionableItems)
  const productionImpact = deriveProductionImpact(health, mdArrays, summary)
  const headline = buildHeadline(health, actionableItems.filter(a => a.severity !== 'info').length || actionableItems.length, t)

  return {
    health,
    productionImpact,
    headline,
    summary,
    actionableItems,
    technicalDetails: buildTechnicalDetails(overview, clusterPeers),
  }
}

export function prioritySortActionable(items: RaidActionableItem[]): RaidActionableItem[] {
  const rank = { critical: 0, warning: 1, info: 2 }
  return [...items].sort((a, b) => rank[a.severity] - rank[b.severity])
}
