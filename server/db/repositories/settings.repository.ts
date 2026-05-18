/**
 * Repository des paramètres applicatifs (cf. SDD v3.0 §3).
 */
import { getDB } from '../index'
import { appSettings } from '../schema'
import { eq } from 'drizzle-orm'
import { encrypt, decrypt } from '../../utils/crypto'

type SettingType = 'string' | 'number' | 'boolean' | 'secret'

// ─── Lecture ─────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db  = getDB()
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) })
  if (!row) return null

  // Déchiffrer les secrets à la lecture
  if (row.type === 'secret' && row.value) {
    return decrypt(row.value)
  }
  return row.value
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db   = getDB()
  const rows = await db.select().from(appSettings)
  const map: Record<string, string> = {}

  for (const row of rows) {
    // Ne jamais retourner les secrets déchiffrés dans le bulk
    if (row.type === 'secret') {
      map[row.key] = row.value ? '***' : ''
    } else {
      map[row.key] = row.value
    }
  }
  return map
}

// ─── Écriture ─────────────────────────────────────────────────────────────────

export async function setSetting(
  key:   string,
  value: string,
  type?: SettingType,
): Promise<void> {
  const db  = getDB()
  const now = new Date().toISOString()

  const existing = await db.query.appSettings.findFirst({ where: eq(appSettings.key, key) })
  const resolvedType: SettingType = type ?? (existing?.type as SettingType) ?? 'string'
  const storedValue = resolvedType === 'secret' && value ? encrypt(value) : value

  await db
    .insert(appSettings)
    .values({ key, value: storedValue, type: resolvedType, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set:    { value: storedValue, updatedAt: now },
    })
}

export async function setSettings(entries: Array<{ key: string; value: string }>): Promise<void> {
  await Promise.all(entries.map((e) => setSetting(e.key, e.value)))
}
