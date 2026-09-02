import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as schema from './schema'
import * as relations from './relations'

const DB_PATH = process.env.DB_PATH ?? '/app/data/esos-webui.db'
/** Prefer WAL; fall back to DELETE when the volume does not support mmap/SHM. */
const JOURNAL_MODE = (process.env.DB_JOURNAL_MODE ?? 'WAL').toUpperCase()
/** When true (default), quarantine an unreadable DB and recreate an empty one. */
const RESET_ON_IOERR = (process.env.DB_RESET_ON_IOERR ?? 'true').toLowerCase() !== 'false'

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

function probeWritableDir(dir: string): void {
  const probe = join(dir, `.esos-db-write-probe-${process.pid}`)
  try {
    writeFileSync(probe, 'ok')
    unlinkSync(probe)
  } catch (err) {
    console.error(
      `[DB] Directory not writable: ${dir} (${(err as Error).message}) — check volume mount/permissions`,
    )
    throw err
  }
}

function quarantineCorruptDb(path: string): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${path}.corrupt-${stamp}`
  removeSidecar(path, '-wal')
  removeSidecar(path, '-shm')
  if (existsSync(path)) {
    renameSync(path, backup)
    console.error(`[DB] Quarantined unreadable database → ${backup}`)
  }
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
      try {
        const applied = String(sqlite.pragma('journal_mode = DELETE', { simple: true }))
        return applied.toUpperCase()
      } catch (deleteErr) {
        try { sqlite.close() } catch { /* ignore */ }
        throw deleteErr
      }
    }
    try { sqlite.close() } catch { /* ignore */ }
    throw err
  }
}

function openOnce(clearSidecars: boolean): Database.Database {
  if (clearSidecars) {
    removeSidecar(DB_PATH, '-wal')
    removeSidecar(DB_PATH, '-shm')
  }
  const sqlite = new Database(DB_PATH)
  try {
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('busy_timeout = 5000')
    // Cheap read to force a real page touch (catches corrupt headers early).
    sqlite.pragma('schema_version')
    const journal = configureJournal(sqlite, JOURNAL_MODE)
    console.log(`[DB] Opened ${DB_PATH} (journal_mode=${journal})`)
    return sqlite
  } catch (err) {
    try { sqlite.close() } catch { /* ignore */ }
    throw err
  }
}

function openSqlite(): Database.Database {
  ensureDbDir(DB_PATH)
  probeWritableDir(dirname(DB_PATH))

  const attempts: Array<{ label: string; run: () => Database.Database }> = [
    { label: 'open', run: () => openOnce(false) },
    { label: 'clear-sidecars', run: () => openOnce(true) },
  ]
  if (RESET_ON_IOERR) {
    attempts.push({
      label: 'quarantine-recreate',
      run: () => {
        quarantineCorruptDb(DB_PATH)
        return openOnce(false)
      },
    })
  }

  let lastErr: unknown
  for (const attempt of attempts) {
    try {
      return attempt.run()
    } catch (err) {
      lastErr = err
      if (!isIoError(err)) {
        console.error(`[DB] Open failed for ${DB_PATH} [${attempt.label}]:`, (err as Error).message)
        throw err
      }
      console.warn(
        `[DB] I/O error on ${DB_PATH} [${attempt.label}]: ${(err as Error).message}`,
      )
    }
  }

  console.error(
    `[DB] All open attempts failed for ${DB_PATH}.`,
    'If using Alpine images with better-sqlite3@13, switch to Debian slim.',
    'Or set DB_RESET_ON_IOERR=true (default) and redeploy to quarantine a corrupt file.',
  )
  throw lastErr
}

export function getDB(): DB {
  if (_db) return _db

  const sqlite = openSqlite()
  _db = drizzle(sqlite, { schema: { ...schema, ...relations } })

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
  _db = null
}
