import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as schema from './schema'
import * as relations from './relations'

const DB_PATH = process.env.DB_PATH ?? '/app/data/esos-webui.db'

type DB = BetterSQLite3Database<typeof schema & typeof relations>

let _db: DB | null = null

export function getDB(): DB {
  if (_db) return _db

  // Ensure parent directory exists (volume might be empty on first boot)
  try {
    mkdirSync(dirname(DB_PATH), { recursive: true })
  } catch {
    /* ignore */
  }

  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

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
