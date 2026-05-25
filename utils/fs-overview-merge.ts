import type { FsDetectionDiagnostics, FsOverview } from '~/types/filesystem'

function preferNonEmpty<T>(next: T[], prev: T[] | undefined, partial: boolean): T[] {
  if (!partial) return next
  if (next.length > 0) return next
  return prev?.length ? prev : next
}

function mergeWarnings(prev: FsOverview, next: FsOverview): string[] {
  const out: string[] = []
  for (const src of [prev.scanWarnings, prev.warnings, next.scanWarnings, next.warnings]) {
    for (const w of src ?? []) {
      if (w && !out.includes(w)) out.push(w)
    }
  }
  return out
}

function mergeDiagnostics(
  prev: FsDetectionDiagnostics,
  next: FsDetectionDiagnostics,
): FsDetectionDiagnostics {
  const pm = prev.mountCounts
  const nm = next.mountCounts
  const ps = prev.scst
  const ns = next.scst
  const pc = prev.candidates
  const nc = next.candidates

  const byKind: FsDetectionDiagnostics['candidates']['byKind'] = { ...pc.byKind }
  for (const [k, v] of Object.entries(nc.byKind ?? {})) {
    const key = k as keyof typeof byKind
    byKind[key] = Math.max(byKind[key] ?? 0, v ?? 0)
  }

  return {
    mountCounts: {
      findmnt: Math.max(pm.findmnt, nm.findmnt),
      lsblk: Math.max(pm.lsblk, nm.lsblk),
      df: Math.max(pm.df, nm.df),
      fileioData: Math.max(pm.fileioData, nm.fileioData),
      system: Math.max(pm.system, nm.system),
      other: Math.max(pm.other, nm.other),
    },
    scst: {
      configBytes: Math.max(ps.configBytes, ns.configBytes),
      handlers: Math.max(ps.handlers, ns.handlers),
      fileioDevices: Math.max(ps.fileioDevices, ns.fileioDevices),
      lunMappings: Math.max(ps.lunMappings, ns.lunMappings),
      sysfsDevices: Math.max(ps.sysfsDevices, ns.sysfsDevices),
    },
    vdiskFiles: Math.max(prev.vdiskFiles ?? 0, next.vdiskFiles ?? 0),
    candidates: {
      total: Math.max(pc.total, nc.total),
      eligible: Math.max(pc.eligible, nc.eligible),
      byKind,
    },
    vdiskScanRoots: next.vdiskScanRoots.length ? next.vdiskScanRoots : prev.vdiskScanRoots,
    excludedMounts: [...new Set([...prev.excludedMounts, ...next.excludedMounts])],
    warnings: [...new Set([...prev.warnings, ...next.warnings])],
  }
}

/** Merge a partial refresh into prior overview so failed scanners do not zero lists. */
export function mergeFsOverview(prev: FsOverview | null, next: FsOverview): FsOverview {
  if (!prev || !next.partial) return next

  const scanWarnings = mergeWarnings(prev, next)
  const diagnostics = prev.diagnostics && next.diagnostics
    ? mergeDiagnostics(prev.diagnostics, next.diagnostics)
    : (next.diagnostics ?? prev.diagnostics)

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
    scanWarnings,
    diagnostics,
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
