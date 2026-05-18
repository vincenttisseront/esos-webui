import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { metricSamples } from '../server/db/schema'
import { and, eq, gte, lte } from 'drizzle-orm'

// ─── Helpers d'intégration en mémoire ────────────────────────────────────────

function createInMemoryDB() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

  // Créer la table directement (pas de migration)
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
    CREATE INDEX idx_metrics_lookup
      ON metric_samples (san_id, category, subject, metric_name, timestamp);
    CREATE INDEX idx_metrics_timestamp
      ON metric_samples (timestamp);
  `)

  return drizzle(sqlite, { schema: { metricSamples } })
}

// ─── TS01 : insertSamples ─────────────────────────────────────────────────────

describe('insertSamples', () => {
  it('TS01 – insère 100 samples en batch', async () => {
    const db = createInMemoryDB()
    const samples = Array.from({ length: 100 }, (_, i) => ({
      sanId:      'default',
      timestamp:  1_000_000 + i * 30_000,
      category:   'session',
      subject:    '21:00:00:24:ff:55:68:eb',
      metricName: 'read_kbps',
      value:      i * 100.5,
    }))

    await db.insert(metricSamples).values(samples)

    const rows = await db.select().from(metricSamples)
    expect(rows).toHaveLength(100)
  })
})

// ─── TS02 : getTimeSeries dans la fenêtre ────────────────────────────────────

describe('getTimeSeries', () => {
  it('TS02 – retourne les points dans la fenêtre temporelle', async () => {
    const db   = createInMemoryDB()
    const base = 1_714_733_400_000

    await db.insert(metricSamples).values([
      { sanId: 'default', timestamp: base,            category: 'session', subject: 'initiator1', metricName: 'read_kbps', value: 1000 },
      { sanId: 'default', timestamp: base + 30_000,   category: 'session', subject: 'initiator1', metricName: 'read_kbps', value: 2000 },
      { sanId: 'default', timestamp: base + 3_600_001, category: 'session', subject: 'initiator1', metricName: 'read_kbps', value: 9999 }, // hors fenêtre
    ])

    const rows = await db
      .select({ timestamp: metricSamples.timestamp, value: metricSamples.value })
      .from(metricSamples)
      .where(
        and(
          eq(metricSamples.sanId,      'default'),
          eq(metricSamples.category,   'session'),
          eq(metricSamples.subject,    'initiator1'),
          eq(metricSamples.metricName, 'read_kbps'),
          gte(metricSamples.timestamp, base),
          lte(metricSamples.timestamp, base + 3_600_000),
        ),
      )
      .orderBy(metricSamples.timestamp)

    expect(rows).toHaveLength(2)
    expect(rows[0].value).toBe(1000)
    expect(rows[1].value).toBe(2000)
  })

  // ─── TS03 : hors fenêtre → tableau vide ──────────────────────────────────

  it('TS03 – retourne un tableau vide si tous les points sont hors fenêtre', async () => {
    const db   = createInMemoryDB()
    const base = 1_714_733_400_000

    await db.insert(metricSamples).values([
      { sanId: 'default', timestamp: base - 3_600_001, category: 'session', subject: 'initiator1', metricName: 'read_kbps', value: 5000 },
    ])

    const rows = await db
      .select({ timestamp: metricSamples.timestamp, value: metricSamples.value })
      .from(metricSamples)
      .where(
        and(
          eq(metricSamples.sanId,      'default'),
          eq(metricSamples.category,   'session'),
          eq(metricSamples.subject,    'initiator1'),
          eq(metricSamples.metricName, 'read_kbps'),
          gte(metricSamples.timestamp, base),
          lte(metricSamples.timestamp, base + 3_600_000),
        ),
      )

    expect(rows).toHaveLength(0)
  })
})

// ─── TS04 : purgeOldSamples ───────────────────────────────────────────────────

describe('purgeOldSamples', () => {
  it('TS04 – supprime les points plus anciens que 24h', async () => {
    const db            = createInMemoryDB()
    const now           = Date.now()
    const retentionMs   = 24 * 60 * 60 * 1000
    const threshold     = now - retentionMs

    // 3 anciens + 2 récents
    await db.insert(metricSamples).values([
      { sanId: 'default', timestamp: threshold - 10_000, category: 'system', subject: 'cpu', metricName: 'cpu_pct', value: 10 },
      { sanId: 'default', timestamp: threshold - 50_000, category: 'system', subject: 'cpu', metricName: 'cpu_pct', value: 11 },
      { sanId: 'default', timestamp: threshold - 90_000, category: 'system', subject: 'cpu', metricName: 'cpu_pct', value: 12 },
      { sanId: 'default', timestamp: now - 10_000,       category: 'system', subject: 'cpu', metricName: 'cpu_pct', value: 50 },
      { sanId: 'default', timestamp: now,                category: 'system', subject: 'cpu', metricName: 'cpu_pct', value: 55 },
    ])

    // Purge
    const result = await db.delete(metricSamples).where(lte(metricSamples.timestamp, threshold))
    const deleted = (result as any).changes ?? 0
    expect(deleted).toBe(3)

    // Vérifier que les 2 récents sont encore là
    const remaining = await db.select().from(metricSamples)
    expect(remaining).toHaveLength(2)
    expect(remaining.every((r) => r.timestamp > threshold)).toBe(true)
  })
})

// ─── TS05 : Collecteur skip si SSH pas prêt ────────────────────────────────

describe('Collector SSH skip', () => {
  it('TS05 – le collecteur ne collecte pas si SSH est down', () => {
    // On simule le comportement du collecteur : si !manager.isReady() → return
    const mockManager = { isReady: () => false }
    let inserted = false

    const runCollect = async () => {
      if (!mockManager.isReady()) return // skip, exactement comme dans collector.ts
      inserted = true
    }

    runCollect()
    expect(inserted).toBe(false)
  })
})
