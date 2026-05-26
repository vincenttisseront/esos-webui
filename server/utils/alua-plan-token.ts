import { createHash, randomBytes } from 'node:crypto'
import type { AluaClusterPlan } from '../../types/alua'

const TTL_MS = 15 * 60 * 1000
const store = new Map<string, { plan: AluaClusterPlan; expiresAt: number }>()

export function issuePlanToken(plan: AluaClusterPlan): string {
  const token = createHash('sha256')
    .update(randomBytes(16))
    .update(JSON.stringify(plan.nodes.map(n => n.nodeId)))
    .digest('hex')
    .slice(0, 32)
  store.set(token, { plan, expiresAt: Date.now() + TTL_MS })
  return token
}

export function consumePlanToken(token: string): AluaClusterPlan | null {
  const entry = store.get(token)
  if (!entry) return null
  store.delete(token)
  if (Date.now() > entry.expiresAt) return null
  return entry.plan
}

export function peekPlanToken(token: string): AluaClusterPlan | null {
  const entry = store.get(token)
  if (!entry || Date.now() > entry.expiresAt) return null
  return entry.plan
}

/** @internal test helper */
export function clearPlanTokens(): void {
  store.clear()
}
