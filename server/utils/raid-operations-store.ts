/**
 * Store mémoire pour les opérations RAID en Phase 1 (SDD v3.12 §8.5).
 * En Phase 5, sera remplacé par la persistance DB (raid_operations table).
 */
import type { RaidOperation } from './raid-types'

// Singleton par processus
const _store = new Map<string, RaidOperation>()

export function getRaidOperations(sanId?: string): RaidOperation[] {
  const all = Array.from(_store.values()).sort((a, b) => b.createdAt - a.createdAt)
  if (sanId) return all.filter(op => op.sanId === sanId)
  return all
}

export function getRaidOperation(id: string): RaidOperation | undefined {
  return _store.get(id)
}

export function addRaidOperation(op: RaidOperation): void {
  _store.set(op.id, op)
  // Garder max 200 opérations en mémoire
  if (_store.size > 200) {
    const oldest = Array.from(_store.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, _store.size - 200)
    for (const [k] of oldest) _store.delete(k)
  }
}

export function updateRaidOperation(id: string, patch: Partial<RaidOperation>): void {
  const op = _store.get(id)
  if (op) _store.set(id, { ...op, ...patch })
}

export function cancelRaidOperation(id: string): RaidOperation | undefined {
  const op = _store.get(id)
  if (!op) return undefined
  if (op.status !== 'planned' && op.status !== 'running') return op
  const updated = { ...op, status: 'cancelled' as const, finishedAt: Date.now() }
  _store.set(id, updated)
  return updated
}
