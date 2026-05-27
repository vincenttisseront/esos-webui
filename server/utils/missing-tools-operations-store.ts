import type { MissingToolsOperation } from '~/types/missing-tools'

const _store = new Map<string, MissingToolsOperation>()

export function addMissingToolsOperation(op: MissingToolsOperation): void {
  _store.set(op.id, op)
  if (_store.size > 200) {
    const oldest = Array.from(_store.entries())
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, _store.size - 200)
    for (const [k] of oldest) _store.delete(k)
  }
}

export function getMissingToolsOperation(id: string): MissingToolsOperation | undefined {
  return _store.get(id)
}

export function updateMissingToolsOperation(id: string, patch: Partial<MissingToolsOperation>): void {
  const op = _store.get(id)
  if (!op) return
  _store.set(id, { ...op, ...patch })
}


