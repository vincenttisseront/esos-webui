import type { UpgradePlan } from '~/types/upgrade'

const _plans = new Map<string, UpgradePlan>()
const TTL_MS = 60 * 60 * 1000

export function saveUpgradePlan(plan: UpgradePlan): void {
  _plans.set(plan.id, plan)
  pruneExpired()
}

export function getUpgradePlan(id: string): UpgradePlan | undefined {
  const p = _plans.get(id)
  if (!p) return undefined
  if (Date.now() - p.createdAt > TTL_MS) {
    _plans.delete(id)
    return undefined
  }
  return p
}

function pruneExpired(): void {
  const now = Date.now()
  for (const [id, p] of _plans) {
    if (now - p.createdAt > TTL_MS) _plans.delete(id)
  }
  if (_plans.size > 100) {
    const sorted = [..._plans.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)
    for (let i = 0; i < sorted.length - 100; i++) _plans.delete(sorted[i][0])
  }
}
