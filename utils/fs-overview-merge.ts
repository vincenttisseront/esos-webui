import type { FsOverview } from '~/types/filesystem'

function preferNonEmpty<T>(next: T[], prev: T[] | undefined, partial: boolean): T[] {
  if (!partial) return next
  if (next.length > 0) return next
  return prev?.length ? prev : next
}

/** Merge a partial refresh into prior overview so failed scanners do not zero lists. */
export function mergeFsOverview(prev: FsOverview | null, next: FsOverview): FsOverview {
  if (!prev || !next.partial) return next

  return {
    ...next,
    mounts: preferNonEmpty(next.mounts, prev.mounts, true),
    vdiskFiles: preferNonEmpty(next.vdiskFiles, prev.vdiskFiles, true),
    fileioDevices: preferNonEmpty(next.fileioDevices, prev.fileioDevices, true),
    lunMappings: preferNonEmpty(next.lunMappings, prev.lunMappings, true),
    backends: preferNonEmpty(next.backends, prev.backends, true),
    links: next.links.length ? next.links : prev.links,
    candidates: next.candidates?.length
      ? next.candidates
      : prev.candidates ?? next.candidates,
  }
}

export function hasDetectedInventory(overview: FsOverview | null): boolean {
  if (!overview) return false
  const d = overview.diagnostics
  return (
    overview.mounts.length > 0
    || overview.vdiskFiles.length > 0
    || overview.fileioDevices.length > 0
    || overview.lunMappings.length > 0
    || (d?.mountCounts?.fileioData ?? 0) > 0
    || (d?.scst?.fileioDevices ?? 0) > 0
    || (d?.scst?.lunMappings ?? 0) > 0
  )
}
