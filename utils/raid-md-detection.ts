import type { MdArray, MdDetectionItem, MdDetectionSummary, RaidOverviewResponse } from '~/types/raid'

export function collectActiveMdMemberPaths(mdArrays: MdArray[]): Set<string> {
  const paths = new Set<string>()
  for (const arr of mdArrays) {
    for (const member of arr.members) {
      const path = member.path?.trim()
      if (path && path !== '—') paths.add(path)
    }
  }
  return paths
}

export function isOrphanMetadataDetectionItem(
  item: MdDetectionItem,
  activeMemberPaths: Set<string>,
): boolean {
  if (activeMemberPaths.has(item.path)) return false
  if (item.kind === 'partition_metadata') return true
  return item.kind === 'stopped_examine' && item.recommendedAction === 'zero_superblock'
}

export function hasAnyMdStateVisible(overview: RaidOverviewResponse | null | undefined): boolean {
  if (!overview) return false
  if (overview.mdDetection?.hasAnyMdState) return true
  return overview.clusterMdDetection?.some(n => n.hasAnyMdState) ?? false
}

export function currentNodeDetectionItems(overview: RaidOverviewResponse | null | undefined): MdDetectionItem[] {
  return overview?.mdDetection?.items ?? []
}

export function partitionMetadataItems(overview: RaidOverviewResponse | null | undefined): MdDetectionItem[] {
  return currentNodeDetectionItems(overview).filter(i => i.kind === 'partition_metadata')
}

export function blockDeviceRaidItems(overview: RaidOverviewResponse | null | undefined): MdDetectionItem[] {
  return currentNodeDetectionItems(overview).filter(i => i.kind === 'block_device_raid')
}

export function peerNodesWithMdState(
  overview: RaidOverviewResponse | null | undefined,
  currentSanId: string,
): MdDetectionSummary[] {
  return (overview?.clusterMdDetection ?? []).filter(
    n => n.nodeSanId !== currentSanId && n.hasAnyMdState,
  )
}

export function mdDetectionPathSet(overview: RaidOverviewResponse | null | undefined): Set<string> {
  const paths = new Set<string>()
  for (const item of currentNodeDetectionItems(overview)) paths.add(item.path)
  return paths
}

/** Local + peer detection items for blocker panel and navigation. */
export function allMdDetectionItems(overview: RaidOverviewResponse | null | undefined): MdDetectionItem[] {
  const local = currentNodeDetectionItems(overview)
  const peerItems = (overview?.clusterMdDetection ?? []).flatMap(node =>
    node.items.map(item => ({
      ...item,
      nodeSanId: node.nodeSanId,
      nodeLabel: node.nodeLabel,
    })),
  )
  return [...local, ...peerItems]
}

function attentionPriority(item: MdDetectionItem): number {
  if (item.severity === 'blocking') return 0
  if (item.recommendedAction && item.recommendedAction !== 'none') return 1
  if (item.severity === 'warning') return 2
  return 3
}

export function sortAttentionItems(items: MdDetectionItem[]): MdDetectionItem[] {
  return [...items].sort((a, b) => attentionPriority(a) - attentionPriority(b))
}

export function isAttentionItem(item: MdDetectionItem): boolean {
  if (item.recommendedAction && item.recommendedAction !== 'none') return true
  return item.severity === 'warning' || item.severity === 'blocking'
}

export function partitionAttentionItems(
  items: MdDetectionItem[],
  currentSanId: string,
): { local: MdDetectionItem[]; peer: MdDetectionItem[] } {
  const filtered = sortAttentionItems(items.filter(isAttentionItem))
  const local: MdDetectionItem[] = []
  const peer: MdDetectionItem[] = []
  for (const item of filtered) {
    if (item.nodeSanId === currentSanId) local.push(item)
    else peer.push(item)
  }
  return { local, peer }
}

export function truncateSummary(text: string, maxLen = 60): string {
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1)}…`
}
