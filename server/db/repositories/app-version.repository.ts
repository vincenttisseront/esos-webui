import { randomUUID } from 'node:crypto'
import { desc } from 'drizzle-orm'
import { getDB } from '../index'
import { appVersion, appVersionHistory } from '../schema'

// ─── Types ──────────────────────────────────────────────────────────────────

export type AppVersionSource = 'startup' | 'migration' | 'manual' | 'ci'

export interface RuntimeAppVersion {
  version: string
  build?: string
  gitCommit?: string
  gitBranch?: string
  buildDate?: string
  environment?: string
  dbSchemaVersion: number
}

export interface StoredAppVersion extends RuntimeAppVersion {
  id: 'global'
  updatedAt: string
}

export interface AppVersionHistoryEntry {
  id: string
  version: string
  previousVersion?: string
  build?: string
  previousBuild?: string
  gitCommit?: string
  previousGitCommit?: string
  gitBranch?: string
  buildDate?: string
  dbSchemaVersion: number
  appliedAt: string
  source: AppVersionSource
  notes?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToStored(row: typeof appVersion.$inferSelect): StoredAppVersion {
  return {
    id:              'global',
    version:         row.version,
    build:           row.build       ?? undefined,
    gitCommit:       row.gitCommit   ?? undefined,
    gitBranch:       row.gitBranch   ?? undefined,
    buildDate:       row.buildDate   ?? undefined,
    environment:     row.environment ?? undefined,
    dbSchemaVersion: row.dbSchemaVersion,
    updatedAt:       row.updatedAt,
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getAppVersion(): StoredAppVersion | null {
  const db  = getDB()
  const row = db.select().from(appVersion).limit(1).get()
  if (!row) return null
  return rowToStored(row)
}

export function upsertAppVersion(
  input: RuntimeAppVersion,
  source: AppVersionSource = 'startup',
): StoredAppVersion {
  const db       = getDB()
  const previous = getAppVersion()
  const now      = new Date().toISOString()

  const changed =
    !previous                                    ||
    previous.version         !== input.version   ||
    previous.build           !== input.build      ||
    previous.gitCommit       !== input.gitCommit  ||
    previous.dbSchemaVersion !== input.dbSchemaVersion

  db.insert(appVersion)
    .values({
      id:              'global',
      version:         input.version,
      build:           input.build           ?? null,
      gitCommit:       input.gitCommit       ?? null,
      gitBranch:       input.gitBranch       ?? null,
      buildDate:       input.buildDate       ?? null,
      environment:     input.environment     ?? null,
      dbSchemaVersion: input.dbSchemaVersion,
      updatedAt:       now,
    })
    .onConflictDoUpdate({
      target: appVersion.id,
      set: {
        version:         input.version,
        build:           input.build           ?? null,
        gitCommit:       input.gitCommit       ?? null,
        gitBranch:       input.gitBranch       ?? null,
        buildDate:       input.buildDate       ?? null,
        environment:     input.environment     ?? null,
        dbSchemaVersion: input.dbSchemaVersion,
        updatedAt:       now,
      },
    })
    .run()

  if (changed) {
    db.insert(appVersionHistory)
      .values({
        id:                randomUUID(),
        version:           input.version,
        previousVersion:   previous?.version           ?? null,
        build:             input.build                 ?? null,
        previousBuild:     previous?.build             ?? null,
        gitCommit:         input.gitCommit             ?? null,
        previousGitCommit: previous?.gitCommit         ?? null,
        gitBranch:         input.gitBranch             ?? null,
        buildDate:         input.buildDate             ?? null,
        dbSchemaVersion:   input.dbSchemaVersion,
        appliedAt:         now,
        source,
        notes:             null,
      })
      .run()
  }

  return getAppVersion()!
}

export function listAppVersionHistory(limit = 50): AppVersionHistoryEntry[] {
  const db   = getDB()
  const rows = db
    .select()
    .from(appVersionHistory)
    .orderBy(desc(appVersionHistory.appliedAt))
    .limit(limit)
    .all()

  return rows.map(r => ({
    id:                r.id,
    version:           r.version,
    previousVersion:   r.previousVersion   ?? undefined,
    build:             r.build             ?? undefined,
    previousBuild:     r.previousBuild     ?? undefined,
    gitCommit:         r.gitCommit         ?? undefined,
    previousGitCommit: r.previousGitCommit ?? undefined,
    gitBranch:         r.gitBranch         ?? undefined,
    buildDate:         r.buildDate         ?? undefined,
    dbSchemaVersion:   r.dbSchemaVersion,
    appliedAt:         r.appliedAt,
    source:            r.source as AppVersionSource,
    notes:             r.notes             ?? undefined,
  }))
}

/**
 * Retourne le numéro de la dernière migration appliquée.
 * Drizzle better-sqlite3 stocke les migrations dans `__drizzle_migrations`.
 */
export function getDbSchemaVersion(): number {
  try {
    // Access the raw better-sqlite3 connection through the drizzle session
    const db    = getDB()
    const raw   = (db as any).session?.client as import('better-sqlite3').Database | undefined
    if (!raw) return 0
    const row = raw.prepare('SELECT COUNT(*) AS v FROM __drizzle_migrations').get() as { v: number } | undefined
    return row?.v ?? 0
  } catch {
    return 0
  }
}
