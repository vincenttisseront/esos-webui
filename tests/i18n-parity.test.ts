import { describe, it, expect } from 'vitest'
import fr from '../i18n/locales/fr.json'
import en from '../i18n/locales/en.json'

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

describe('i18n locale parity', () => {
  const flatFr = flatten(fr as Json)
  const flatEn = flatten(en as Json)
  const keysFr = Object.keys(flatFr).sort()
  const keysEn = Object.keys(flatEn).sort()

  it('exposes the same set of keys in fr.json and en.json', () => {
    const missingInEn = keysFr.filter((k) => !(k in flatEn))
    const missingInFr = keysEn.filter((k) => !(k in flatFr))
    expect(missingInEn, `keys present in fr.json but missing in en.json: ${missingInEn.join(', ')}`).toEqual([])
    expect(missingInFr, `keys present in en.json but missing in fr.json: ${missingInFr.join(', ')}`).toEqual([])
  })

  it('has no empty leaves', () => {
    const empty = (entries: Record<string, string>) =>
      Object.entries(entries).filter(([, v]) => v.trim().length === 0).map(([k]) => k)
    expect(empty(flatFr), `empty values in fr.json: ${empty(flatFr).join(', ')}`).toEqual([])
    expect(empty(flatEn), `empty values in en.json: ${empty(flatEn).join(', ')}`).toEqual([])
  })

  it('declares both `fr` and `en` in the languages namespace', () => {
    expect(flatFr['languages.fr']).toBeTruthy()
    expect(flatFr['languages.en']).toBeTruthy()
    expect(flatEn['languages.fr']).toBeTruthy()
    expect(flatEn['languages.en']).toBeTruthy()
  })
})
