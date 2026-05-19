import type { MdDetectionItem, MdDetectionSummary, RaidOverviewResponse } from '~/types/raid'

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
