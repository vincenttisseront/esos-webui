/**
 * Persistance légère pour la fenêtre de grâce des alertes session (par SAN).
 */
import { and, eq, notInArray } from 'drizzle-orm'
import { getDB } from '../index'
import { alertSessionState } from '../schema'

export function clearSessionGraceState(sanId: string): void {
  getDB().delete(alertSessionState).where(eq(alertSessionState.sanId, sanId)).run()
}

/**
 * Met à jour l'état de grâce et retourne les clés pour lesquelles une alerte
 * doit être émise (avec `since` = first_violation_at en ms epoch).
 *
 * @param violated — clés actuellement en violation (ensemble exact à conserver en BDD)
 */
export function finalizeSessionGrace(
  sanId: string,
  violated: ReadonlySet<string>,
  graceSec: number,
  nowMs: number,
): Map<string, number> {
  const db = getDB()

  if (violated.size === 0) {
    db.delete(alertSessionState).where(eq(alertSessionState.sanId, sanId)).run()
    return new Map()
  }

  const keys = [...violated]
  db.delete(alertSessionState)
    .where(and(eq(alertSessionState.sanId, sanId), notInArray(alertSessionState.dedupeKey, keys)))
    .run()

  for (const dedupeKey of keys) {
    db.insert(alertSessionState)
      .values({ sanId, dedupeKey, firstViolationAt: nowMs })
      .onConflictDoNothing()
      .run()
  }

  const graceMs = graceSec * 1000
  const emit = new Map<string, number>()
  for (const dedupeKey of keys) {
    const row = db
      .select()
      .from(alertSessionState)
      .where(and(eq(alertSessionState.sanId, sanId), eq(alertSessionState.dedupeKey, dedupeKey)))
      .limit(1)
      .all()[0]
    if (!row) continue
    const first = row.firstViolationAt
    if (graceSec === 0 || nowMs - first >= graceMs) {
      emit.set(dedupeKey, first)
    }
  }
  return emit
}
