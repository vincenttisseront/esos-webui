import type {
  PartitionMetadataDiagnostics,
  RaidOverviewResponse,
  StoppedMdArray,
  ZeroMdSuperblockPartitionResult,
} from '~/types/raid'

const MD_ARRAY_NAME_RE = /^md[a-z0-9_-]{0,15}$/

export const MD_ZERO_METADATA_CONFIRMATION = 'ZERO RAID METADATA'
export const MD_ADVANCED_CLEANUP_CONFIRMATION = 'FORCE CLEAN MD METADATA'
/** @deprecated Use MD_ADVANCED_CLEANUP_CONFIRMATION */
export const MD_WIPE_SIGNATURES_CONFIRMATION = MD_ADVANCED_CLEANUP_CONFIRMATION

export function pendingAdvancedStorageKey(sanId: string): string {
  return `raid-pending-advanced-${sanId}`
}

export function normalizePartitionPath(path: string): string {
  if (!path?.trim()) return path
  const trimmed = path.trim()
  return trimmed.startsWith('/dev/') ? trimmed : `/dev/${trimmed}`
}

export function getFetchErrorData(err: unknown): Record<string, unknown> {
  const e = err as { data?: Record<string, unknown> }
  const nested = e?.data?.data
  if (nested && typeof nested === 'object') {
    return nested as Record<string, unknown>
  }
  return (e?.data ?? {}) as Record<string, unknown>
}

export function loadPendingAdvancedCleanup(
  sanId: string,
): Record<string, PartitionMetadataDiagnostics> {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(pendingAdvancedStorageKey(sanId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, PartitionMetadataDiagnostics>
    if (!parsed || typeof parsed !== 'object') return {}
    const normalized: Record<string, PartitionMetadataDiagnostics> = {}
    for (const [key, value] of Object.entries(parsed)) {
      normalized[normalizePartitionPath(key)] = value
    }
    return normalized
  } catch {
    return {}
  }
}

export function savePendingAdvancedCleanup(
  sanId: string,
  pending: Record<string, PartitionMetadataDiagnostics>,
): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (Object.keys(pending).length === 0) {
      sessionStorage.removeItem(pendingAdvancedStorageKey(sanId))
    } else {
      sessionStorage.setItem(pendingAdvancedStorageKey(sanId), JSON.stringify(pending))
    }
  } catch { /* quota / private mode */ }
}

export function isValidMdArrayName(name: string): boolean {
  return MD_ARRAY_NAME_RE.test(name)
}

export function stoppedArrayKey(arr: StoppedMdArray): string {
  return arr.uuid ?? arr.name
}

export function stoppedMemberPaths(arr: StoppedMdArray): string[] {
  return arr.members.filter(m => m.present).map(m => normalizePartitionPath(m.path))
}

export function suggestDefaultMdName(overview: RaidOverviewResponse | null): string {
  const used = new Set<string>()
  for (const arr of overview?.mdArrays ?? []) used.add(arr.name)
  for (const arr of overview?.stoppedMdArrays ?? []) {
    if (isValidMdArrayName(arr.name)) used.add(arr.name)
  }
  for (let i = 0; i < 128; i++) {
    const name = `md${i}`
    if (!used.has(name)) return name
  }
  return 'md0'
}

export function isModalDismiss(err: unknown): boolean {
  return err instanceof Error && err.message === 'dismissed'
}

export function extractFetchError(err: unknown): string {
  const payload = getFetchErrorData(err)
  const e = err as {
    data?: { message?: string; statusMessage?: string }
    message?: string
    statusMessage?: string
  }
  const payloadMessage = typeof payload.message === 'string' ? payload.message : undefined
  return payloadMessage
    ?? e?.data?.message
    ?? e?.message
    ?? (typeof payload.statusMessage === 'string' ? payload.statusMessage : undefined)
    ?? e?.data?.statusMessage
    ?? e?.statusMessage
    ?? 'Erreur inconnue'
}

export function getZeroCleanupErrorResults(err: unknown): ZeroMdSuperblockPartitionResult[] {
  const payload = getFetchErrorData(err)
  const results = payload.results
  if (!Array.isArray(results)) return []
  return results
    .filter((r): r is ZeroMdSuperblockPartitionResult => Boolean(r && typeof r === 'object'))
    .map((row) => ({
      ...row,
      partition: normalizePartitionPath(row.partition ?? ''),
    }))
}

export function formatDiagnosticsSummary(diagnostics: PartitionMetadataDiagnostics): string {
  const lines = [`${diagnostics.partition} : métadonnées encore détectées.`]
  if (diagnostics.detectionSources.mdadmExamine) {
    lines.push('- mdadm --examine : superblock détecté')
  }
  if (diagnostics.detectionSources.wipefs && diagnostics.wipefsProbe.signatures.length) {
    lines.push(`- wipefs -n : ${diagnostics.wipefsProbe.signatures.join(', ')}`)
  }
  if (diagnostics.detectionSources.blkid && diagnostics.blkidProbe.types.length) {
    lines.push(`- blkid : ${diagnostics.blkidProbe.types.join(', ')}`)
  }
  if (diagnostics.remainingSignatureTypes.length) {
    lines.push(`Signatures restantes : ${diagnostics.remainingSignatureTypes.join(', ')}`)
  }
  return lines.join('\n')
}

export function advancedCleanupMembersForArray(
  memberPaths: string[],
  pendingAdvancedCleanup: Record<string, unknown>,
): string[] {
  return memberPaths
    .map(normalizePartitionPath)
    .filter(key => key in pendingAdvancedCleanup)
}

export function hasAdvancedWipeAvailable(err: unknown): boolean {
  const payload = getFetchErrorData(err)
  if (payload.advancedCleanupAvailable === true) return true
  return getZeroCleanupErrorResults(err).some(
    r => r.diagnostics?.recommendedAction === 'advanced_wipe_signatures',
  )
}

export function membersStillInStoppedArrays(
  memberPaths: string[],
  stoppedArrays: StoppedMdArray[],
): string[] {
  const still: string[] = []
  for (const path of memberPaths) {
    const found = stoppedArrays.some(arr =>
      arr.members.some(m => m.present && m.path === path),
    )
    if (found) still.push(path)
  }
  return still
}

export function isZeroCleanupFullyVerified(
  result: { ok: boolean; results: Array<{ success: boolean; verifiedRemoved: boolean | null }>; warnings: string[] },
): boolean {
  if (!result.ok) return false
  if (result.warnings.length > 0) return false
  return result.results.every(r => r.success && r.verifiedRemoved === true)
}
