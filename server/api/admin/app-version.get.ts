import { readFileSync } from 'node:fs'
import { join }         from 'node:path'
import { getDB }        from '../../db'
import { sql }          from 'drizzle-orm'
import { resolveRuntimeAppVersion } from '../../utils/app-version'

interface MigrationRow {
  id:         number
  hash:       string
  created_at: number | null
}

interface JournalEntry {
  idx:  number
  tag:  string
  when: number
}

function readJournal(): JournalEntry[] {
  try {
    const path = join(process.cwd(), 'server/db/migrations/meta/_journal.json')
    const raw  = readFileSync(path, 'utf-8')
    return (JSON.parse(raw) as { entries: JournalEntry[] }).entries ?? []
  } catch {
    return []
  }
}

export default defineEventHandler(async () => {
  const db      = getDB()
  const journal = readJournal()

  // Drizzle stocke les migrations appliquées dans __drizzle_migrations
  let appliedCount = 0
  let migrations: Array<{
    idx:       number
    tag:       string
    hash:      string
    appliedAt: string | null
  }> = []

  try {
    const rows = db.all<MigrationRow>(
      sql`SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id ASC`
    )
    appliedCount = rows.length
    migrations = rows.map((r, i) => ({
      idx:       journal[i]?.idx ?? i,
      tag:       journal[i]?.tag ?? `migration_${i}`,
      hash:      r.hash.slice(0, 12),
      appliedAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    }))
  } catch {
    // __drizzle_migrations absente (DB vide ou très ancienne)
    migrations = []
  }

  const lastMigration = migrations.at(-1)
  const runtime = resolveRuntimeAppVersion()

  return {
    app: {
      version:     runtime.version,
      environment: runtime.environment ?? 'production',
    },
    database: {
      schemaVersion: `v${appliedCount}`,
      lastUpdatedAt: lastMigration?.appliedAt ?? null,
      migrations,
    },
  }
})
