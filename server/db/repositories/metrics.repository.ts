import { getDB } from '../index'
import { metricSamples } from '../schema'
import { and, eq, gte, lte } from 'drizzle-orm'

export interface MetricPoint {
  timestamp: number
  value:     number
}

export interface InsertSample {
  sanId:      string
  timestamp:  number
  category:   string
  subject:    string
  metricName: string
  value:      number
}

// ─── Écriture ────────────────────────────────────────────────────────────────

export async function insertSamples(samples: InsertSample[]): Promise<void> {
  if (samples.length === 0) return
  const db = getDB()

  await db.insert(metricSamples).values(
    samples.map((s) => ({
      sanId:      s.sanId,
      timestamp:  s.timestamp,
      category:   s.category,
      subject:    s.subject,
      metricName: s.metricName,
      value:      s.value,
    })),
  )
}

// ─── Lecture : série temporelle brute ────────────────────────────────────────

export async function getTimeSeries(opts: {
  sanId:      string
  category:   string
  subject:    string
  metricName: string
  from:       number
  to:         number
}): Promise<MetricPoint[]> {
  const db   = getDB()
  const rows = await db
    .select({ timestamp: metricSamples.timestamp, value: metricSamples.value })
    .from(metricSamples)
    .where(
      and(
        eq(metricSamples.sanId,      opts.sanId),
        eq(metricSamples.category,   opts.category),
        eq(metricSamples.subject,    opts.subject),
        eq(metricSamples.metricName, opts.metricName),
        gte(metricSamples.timestamp, opts.from),
        lte(metricSamples.timestamp, opts.to),
      ),
    )
    .orderBy(metricSamples.timestamp)

  return rows
}

// ─── Lecture : tous les sujets d'une catégorie sur une fenêtre ───────────────

export async function getSubjects(
  sanId:    string,
  category: string,
  from:     number,
  to:       number,
): Promise<string[]> {
  const db   = getDB()
  const rows = await db
    .selectDistinct({ subject: metricSamples.subject })
    .from(metricSamples)
    .where(
      and(
        eq(metricSamples.sanId,      sanId),
        eq(metricSamples.category,   category),
        gte(metricSamples.timestamp, from),
        lte(metricSamples.timestamp, to),
      ),
    )
  return rows.map((r) => r.subject)
}

// ─── Purge (rétention 24h) ───────────────────────────────────────────────────

export async function purgeOldSamples(
  retentionMs: number = 24 * 60 * 60 * 1000,
): Promise<number> {
  const db        = getDB()
  const threshold = Date.now() - retentionMs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result    = await db
    .delete(metricSamples)
    .where(lte(metricSamples.timestamp, threshold))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (result as any).changes ?? 0
}
