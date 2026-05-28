import type { FsBackendKind, FsBackendRef } from '~/types/filesystem'
import { FS_BACKEND_REASON, normalizeBackendReason, parseMountedAtReason } from '~/utils/fs-backend-reasons'

export type FsBackendStatusGroup = 'available' | 'in_use' | 'ineligible'

export interface ParsedFsBackendReason {
  code: string
  messageKey: string
  messageParams?: Record<string, string>
}

export interface FsBackendEligibilityView {
  backend: FsBackendRef
  path: string
  kind: FsBackendKind
  kindKey: string
  sizeBytes: number
  statusGroup: FsBackendStatusGroup
  statusBadgeKey: string
  reasonViews: ParsedFsBackendReason[]
  summaryKey: string
  summaryParams?: Record<string, string>
  recommendationKey?: string
}

const IN_USE_CODES = new Set([
  FS_BACKEND_REASON.SCST_BLOCKIO,
  FS_BACKEND_REASON.SCST,
  FS_BACKEND_REASON.MOUNTED,
  FS_BACKEND_REASON.MOUNTED_AT,
])

export function kindI18nKey(kind: FsBackendKind): string {
  return `storage.fs.backend.kind.${kind}`
}

export function parseReasonRaw(raw: string): ParsedFsBackendReason {
  const normalized = normalizeBackendReason(raw)
  const mount = parseMountedAtReason(normalized)
  if (mount) {
    return {
      code: FS_BACKEND_REASON.MOUNTED_AT,
      messageKey: FS_BACKEND_REASON.MOUNTED_AT,
      messageParams: { mount },
    }
  }
  if (normalized.startsWith('storage.fs.')) {
    return { code: normalized, messageKey: normalized }
  }
  return { code: 'unknown', messageKey: 'storage.fs.backend.reason.unknown', messageParams: { detail: raw } }
}

export function reasonCodes(backend: FsBackendRef): string[] {
  return backend.reasons.map(r => parseReasonRaw(r).code)
}

export function classifyBackendStatusGroup(backend: FsBackendRef): FsBackendStatusGroup {
  if (backend.eligible) return 'available'
  const codes = reasonCodes(backend)
  if (codes.some(c => IN_USE_CODES.has(c))) return 'in_use'
  return 'ineligible'
}

function dedupeParsedReasons(views: ParsedFsBackendReason[]): ParsedFsBackendReason[] {
  const seen = new Set<string>()
  return views.filter(v => {
    const key = `${v.code}:${v.messageParams?.mount ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function buildBackendEligibilityView(backend: FsBackendRef): FsBackendEligibilityView {
  const statusGroup = classifyBackendStatusGroup(backend)
  const reasonViews = dedupeParsedReasons(backend.reasons.map(parseReasonRaw))
  const codes = reasonViews.map(r => r.code)

  let summaryKey = 'storage.fs.backend.summary.available'
  let summaryParams: Record<string, string> | undefined
  let recommendationKey: string | undefined

  if (statusGroup === 'in_use') {
    if (codes.includes(FS_BACKEND_REASON.SCST_BLOCKIO)) {
      summaryKey = 'storage.fs.backend.summary.scst_blockio'
      recommendationKey = 'storage.fs.backend.recommendation.scst_blockio'
    } else if (codes.includes(FS_BACKEND_REASON.SCST)) {
      summaryKey = 'storage.fs.backend.summary.scst'
      recommendationKey = 'storage.fs.backend.recommendation.scst'
    } else {
      summaryKey = 'storage.fs.backend.summary.in_use'
      recommendationKey = 'storage.fs.backend.recommendation.in_use'
    }
  } else if (statusGroup === 'ineligible') {
    if (backend.kind === 'md' && codes.includes(FS_BACKEND_REASON.LVM_PV)) {
      summaryKey = 'storage.fs.backend.summary.md_lvm_base'
      recommendationKey = 'storage.fs.backend.recommendation.md_lvm_base'
    } else if (codes.includes(FS_BACKEND_REASON.LVM_PV) && codes.includes(FS_BACKEND_REASON.MD_MEMBER)) {
      summaryKey = 'storage.fs.backend.summary.md_lvm_base'
      recommendationKey = 'storage.fs.backend.recommendation.md_lvm_base'
    } else if (codes.includes(FS_BACKEND_REASON.FILESYSTEM_SIGNATURE) && codes.includes(FS_BACKEND_REASON.LVM_PV)) {
      summaryKey = 'storage.fs.backend.summary.md_lvm_base'
      recommendationKey = 'storage.fs.backend.recommendation.md_lvm_base'
    } else {
      summaryKey = 'storage.fs.backend.summary.ineligible'
      recommendationKey = 'storage.fs.backend.recommendation.ineligible'
    }
  }

  const statusBadgeKey = `storage.fs.backend.status.${statusGroup}`

  return {
    backend,
    path: backend.path,
    kind: backend.kind,
    kindKey: kindI18nKey(backend.kind),
    sizeBytes: backend.sizeBytes,
    statusGroup,
    statusBadgeKey,
    reasonViews,
    summaryKey,
    summaryParams,
    recommendationKey,
  }
}

export function groupFileioBackends(backends: FsBackendRef[]): Record<FsBackendStatusGroup, FsBackendEligibilityView[]> {
  const groups: Record<FsBackendStatusGroup, FsBackendEligibilityView[]> = {
    available: [],
    in_use: [],
    ineligible: [],
  }
  for (const b of backends) {
    const view = buildBackendEligibilityView(b)
    groups[view.statusGroup].push(view)
  }
  for (const key of Object.keys(groups) as FsBackendStatusGroup[]) {
    groups[key].sort((a, b) => a.path.localeCompare(b.path))
  }
  return groups
}

export function hasEligibleFileioBackend(backends: FsBackendRef[]): boolean {
  return backends.some(b => b.eligible)
}
