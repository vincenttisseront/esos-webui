import type { MdArray, MdProgress, RaidOverviewResponse } from '~/types/raid'

const ACTIVE_PROGRESS_ACTIONS = new Set<MdProgress['action']>([
  'resync',
  'recovery',
  'reshape',
  'check',
  'repair',
])

export function hasActiveMdArrayProgress(arr: MdArray): boolean {
  if (arr.state === 'resync' || arr.state === 'recovering') return true
  const p = arr.progress
  if (!p) return false
  if (!ACTIVE_PROGRESS_ACTIONS.has(p.action)) return false
  return p.percent < 100 || p.speedKbps != null || Boolean(p.finishEta)
}

export function overviewHasActiveMdProgress(overview: RaidOverviewResponse | null): boolean {
  return (overview?.mdArrays ?? []).some(hasActiveMdArrayProgress)
}

export interface PrimaryResyncSummary {
  path: string
  action: string
  percent: number
  speedMbps: number | null
  eta: string | null
}

export function primaryResyncSummary(mdArrays: MdArray[]): PrimaryResyncSummary | null {
  const active = mdArrays.filter(hasActiveMdArrayProgress)
  const arr = active.find(a => a.progress) ?? active[0]
  if (!arr?.progress) return null
  const p = arr.progress
  return {
    path: arr.path,
    action: p.action,
    percent: p.percent,
    speedMbps: p.speedKbps != null ? p.speedKbps / 1024 : null,
    eta: p.finishEta ?? null,
  }
}
