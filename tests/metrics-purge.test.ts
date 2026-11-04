import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { metricSamples } from '../server/db/schema'

const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../server/db', () => ({ getDB: () => holder.db }))

import { purgeOldSamples } from '../server/db/repositories/metrics.repository'

const DAY = 86_400_000

function seed(expired: number, recent: number) {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE metric_samples (
      id          INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      san_id      TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,
      category    TEXT NOT NULL,
      subject     TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      value       REAL NOT NULL
    );
    CREATE INDEX idx_metrics_timestamp ON metric_samples (timestamp);
  `)
  const db = drizzle(sqlite, { schema: { metricSamples } })
  const now = Date.now()
  const row = (timestamp: number) =>
    ({ sanId: 'default', timestamp, category: 'system', subject: 'cpu', metricName: 'cpu_pct', value: 1 })
  db.insert(metricSamples).values([
    ...Array.from({ length: expired }, (_, i) => row(now - 2 * DAY - i)),
    ...Array.from({ length: recent }, (_, i) => row(now - i)),
  ]).run()
  holder.db = db
  return db
}

describe('purgeOldSamples (par lots)', () => {
  // 10 → lots 5,5,0 (arrêt sur lot vide) ; 12 → lots 5,5,2 (arrêt sur lot partiel)
  it.each([10, 12])('supprime %i points expirés par lots de 5 et garde les récents', async (expired) => {
    const db = seed(expired, 3)
    expect(await purgeOldSamples(DAY, 5)).toBe(expired)
    expect(db.select().from(metricSamples).all()).toHaveLength(3)
  })
})
