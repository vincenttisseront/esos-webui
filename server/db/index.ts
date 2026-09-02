import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as schema from './schema'
import * as relations from './relations'

const DB_PATH = process.env.DB_PATH ?? '/app/data/esos-webui.db'
/** Prefer WAL; fall back to DELETE when the volume does not support mmap/SHM. */
const JOURNAL_MODE = (process.env.DB_JOURNAL_MODE ?? 'WAL').toUpperCase()

type DB = BetterSQLite3Database<typeof schema & typeof relations>

let _db: DB | null = null

function ensureDbDir(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
  } catch {
    /* ignore */
  }
}

function removeSidecar(path: string, suffix: string): void {
  const sidecar = `${path}${suffix}`
  try {
    if (existsSync(sidecar)) unlinkSync(sidecar)
  } catch (err) {
    console.warn(`[DB] Unable to remove ${sidecar}:`, (err as Error).message)
  }
}

function isIoError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err)
  const code = String((err as { code?: string })?.code ?? '')
  return /disk I\/O error/i.test(msg) || code.includes('SQLITE_IOERR')
}

function configureJournal(sqlite: Database.Database, mode: string): string {
  const requested = mode === 'DELETE' || mode === 'TRUNCATE' || mode === 'MEMORY' || mode === 'OFF'
    ? mode
    : 'WAL'
  try {
    const applied = String(sqlite.pragma(`journal_mode = ${requested}`, { simple: true }))
    return applied.toUpperCase()
  } catch (err) {
    if (requested === 'WAL') {
      console.warn(
        `[DB] WAL unavailable on ${DB_PATH} (${(err as Error).message}) — falling back to DELETE`,
      )
      const applied = String(sqlite.pragma('journal_mode = DELETE', { simple: true }))
      return applied.toUpperCase()
    }
    throw err
  }
}

function openSqlite(): Database.Database {
  ensureDbDir(DB_PATH)

  const tryOpen = (clearSidecars: boolean): Database.Database => {
    if (clearSidecars) {
      // Stale -wal/-shm after crash loops often surfaces as SQLITE_IOERR / disk I/O error.
      removeSidecar(DB_PATH, '-wal')
      removeSidecar(DB_PATH, '-shm')
    }
    const sqlite = new Database(DB_PATH)
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('busy_timeout = 5000')
    const journal = configureJournal(sqlite, JOURNAL_MODE)
    console.log(`[DB] Opened ${DB_PATH} (journal_mode=${journal})`)
    return sqlite
  }

  try {
    return tryOpen(false)
  } catch (err) {
    if (!isIoError(err)) {
      console.error(`[DB] Open failed for ${DB_PATH}:`, (err as Error).message)
      throw err
    }
    console.warn(
      `[DB] I/O error opening ${DB_PATH} (${(err as Error).message}) — clearing WAL sidecars and retrying`,
    )
    try {
      return tryOpen(true)
    } catch (retryErr) {
      console.error(
        `[DB] Retry failed for ${DB_PATH}:`,
        (retryErr as Error).message,
        '— check volume filesystem (WAL needs local disk; set DB_JOURNAL_MODE=DELETE if needed)',
      )
      throw retryErr
    }
  }
}

export function getDB(): DB {
  if (_db) return _db

  const sqlite = openSqlite()
  _db = drizzle(sqlite, { schema: { ...schema, ...relations } })

  // Apply pending migrations on startup (cf. SDD v2.0 §5)
  const migrationsFolder = join(process.cwd(), 'server/db/migrations')
  try {
    migrate(_db, { migrationsFolder })
  } catch (err) {
    console.error('[DB] Migration error:', (err as Error).message)
    throw err
  }

  return _db
}

export function closeDB(): void {
  if (!_db) return
  // better-sqlite3's underlying connection is held by drizzle; close via raw handle
  // (drizzle does not expose close(); we recreate the handle if needed).
  _db = null
}
