import type { RaidOverviewResponse, StoppedMdArray } from '~/types/raid'

const MD_ARRAY_NAME_RE = /^md[a-z0-9_-]{0,15}$/

export const MD_ZERO_METADATA_CONFIRMATION = 'ZERO RAID METADATA'

export function isValidMdArrayName(name: string): boolean {
  return MD_ARRAY_NAME_RE.test(name)
}

export function stoppedArrayKey(arr: StoppedMdArray): string {
  return arr.uuid ?? arr.name
}

export function stoppedMemberPaths(arr: StoppedMdArray): string[] {
  return arr.members.filter(m => m.present).map(m => m.path)
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
  const e = err as { data?: { statusMessage?: string }; message?: string }
  return e?.data?.statusMessage ?? e?.message ?? 'Erreur inconnue'
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
