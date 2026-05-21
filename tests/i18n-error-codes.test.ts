import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import fr from '../i18n/locales/fr.json'
import en from '../i18n/locales/en.json'
import { API_ERROR_CODE_I18N_ALIASES, KNOWN_API_ERROR_CODES } from '../server/utils/i18n-error-codes'

type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

function flatten(input: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    out[prefix] = String(input)
    return out
  }
  for (const [k, v] of Object.entries(input)) {
    const next = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Json, next))
    } else {
      out[next] = String(v ?? '')
    }
  }
  return out
}

function resolveErrorKey(code: string): string {
  if (code in API_ERROR_CODE_I18N_ALIASES) {
    return API_ERROR_CODE_I18N_ALIASES[code]!
  }
  return `errors.${code}`
}

describe('i18n error codes', () => {
  const flatFr = flatten(fr as Json)
  const flatEn = flatten(en as Json)

  it('maps every KNOWN_API_ERROR_CODES to a non-empty fr/en locale key', () => {
    const missing: string[] = []
    for (const code of KNOWN_API_ERROR_CODES) {
      const key = resolveErrorKey(code)
      if (!flatFr[key]?.trim()) missing.push(`fr: ${key} (${code})`)
      if (!flatEn[key]?.trim()) missing.push(`en: ${key} (${code})`)
    }
    expect(missing, missing.join('\n')).toEqual([])
  })

  it('server inventory matches grep for data.code in createError throws', () => {
    const serverDir = join(process.cwd(), 'server')
    const codesFromSource = new Set<string>()
    const re = /data:\s*\{\s*code:\s*['"]([^'"]+)['"]/g

    function scanDir(dir: string) {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) scanDir(p)
        else if (p.endsWith('.ts')) {
          const text = readFileSync(p, 'utf8')
          let m: RegExpExecArray | null
          while ((m = re.exec(text)) !== null) codesFromSource.add(m[1]!)
        }
      }
    }
    scanDir(serverDir)

    const known = new Set<string>(KNOWN_API_ERROR_CODES)
    const unlisted = [...codesFromSource].filter((c) => !known.has(c))
    expect(unlisted, `Add to KNOWN_API_ERROR_CODES and locales: ${unlisted.join(', ')}`).toEqual([])
  })
})
