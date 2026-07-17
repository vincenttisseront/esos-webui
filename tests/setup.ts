/**
 * Vitest setup for server utils that rely on Nuxt/Nitro auto-imports
 * and a writable SQLite path outside the container default /app/data.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createError } from 'h3'

const dbDir = join(tmpdir(), 'esos-webui-vitest-data')
mkdirSync(dbDir, { recursive: true })
process.env.DB_PATH ??= join(dbDir, 'esos-webui.db')

// Nuxt/Nitro auto-import used by many server/utils without explicit import
;(globalThis as typeof globalThis & { createError: typeof createError }).createError = createError
