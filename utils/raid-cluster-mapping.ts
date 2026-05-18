import type { ClusterDiskMappingInput, RaidClusterPreparedMappingHint } from '../types/raid'

export function expectedFirstPartitionPath(diskPath: string): string {
  return /\/dev\/(?:nvme\d+n\d+|mmcblk\d+)$/.test(diskPath) ? `${diskPath}p1` : `${diskPath}1`
}

export function derivePartitionMappingsFromDiskMappings(
  diskMappings: ClusterDiskMappingInput[],
): ClusterDiskMappingInput[] {
  return diskMappings.map(mapping => ({
    sourcePath: expectedFirstPartitionPath(mapping.sourcePath),
    targetSanId: mapping.targetSanId,
    targetPath: expectedFirstPartitionPath(mapping.targetPath),
    confirmedBy: 'derived_from_operator_disk_mapping',
    sourceKind: 'partition',
  }))
}

export function buildPreparedClusterMappingHint(input: {
  sourceSanId: string
  clusterId?: string | null
  sourceDisks: string[]
  diskMappings: ClusterDiskMappingInput[]
}): RaidClusterPreparedMappingHint {
  const sourceDisks = [...new Set(input.sourceDisks)]
  return {
    sourceSanId: input.sourceSanId,
    clusterId: input.clusterId ?? undefined,
    createdAt: Date.now(),
    diskMappings: input.diskMappings.map(mapping => ({
      ...mapping,
      confirmedBy: mapping.confirmedBy ?? 'operator',
      sourceKind: mapping.sourceKind ?? 'disk',
    })),
    partitionMappings: derivePartitionMappingsFromDiskMappings(input.diskMappings),
    sourceDisks,
    sourcePartitions: sourceDisks.map(expectedFirstPartitionPath),
  }
}

export function filterPartitionMappingsForDevices(
  hint: RaidClusterPreparedMappingHint | null | undefined,
  selectedDevices: string[],
): ClusterDiskMappingInput[] {
  if (!hint) return []
  const selected = new Set(selectedDevices)
  return hint.partitionMappings.filter(mapping => selected.has(mapping.sourcePath))
}
