/**
 * Résolution de la version runtime de l'application ESOS WebUI (SDD v3.13 §8).
 *
 * Ordre de priorité (version semver) :
 * 1. Variables d'environnement CI / Docker (`NUXT_PUBLIC_APP_VERSION`, `APP_VERSION`)
 * 2. Fichier package.json
 * 3. Fallback `0.0.0-dev`
 *
 * En production, les valeurs « sentinel » (vide, `0.0.0-dev`, etc.) dans les
 * variables d'environnement sont ignorées pour ne pas masquer `package.json`.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { RuntimeAppVersion } from '../db/repositories/app-version.repository'

export type { RuntimeAppVersion }

function trimEnv(s: string | undefined): string | undefined {
  if (s == null) return undefined
  const t = s.trim()
  return t === '' ? undefined : t
}

/**
 * Versions considérées comme absence de release explicite (CI / Docker).
 * Exporté pour les tests unitaires.
 */
export function isDevVersionSentinel(version: string | undefined): boolean {
  if (version == null || version.trim() === '') return true
  const v = version.trim().toLowerCase()
  return v === '0.0.0-dev' || v === 'dev'
}

function readPackageJsonSafe(): { version?: string } | null {
  const candidates = [
    join(process.cwd(), 'package.json'),
    join(process.cwd(), '../package.json'),
    '/app/package.json',
  ]
  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        return JSON.parse(readFileSync(path, 'utf8'))
      }
    } catch {
      // ignored
    }
  }
  return null
}

function resolveVersionString(pkg: { version?: string } | null): string {
  const isProd = process.env.NODE_ENV === 'production'
  const fromPkg = trimEnv(pkg?.version)

  const acceptEnv = (v: string | undefined) => {
    if (!v) return undefined
    if (isProd && isDevVersionSentinel(v)) return undefined
    return v
  }

  const fromEnv =
    acceptEnv(trimEnv(process.env.NUXT_PUBLIC_APP_VERSION)) ||
    acceptEnv(trimEnv(process.env.APP_VERSION))

  return fromEnv || fromPkg || '0.0.0-dev'
}

export function resolveRuntimeAppVersion(): RuntimeAppVersion {
  const pkg = readPackageJsonSafe()

  return {
    version: resolveVersionString(pkg),

    build:
      trimEnv(process.env.BUILD_ID) ||
      trimEnv(process.env.NUXT_PUBLIC_BUILD_ID) ||
      undefined,

    gitCommit:
      trimEnv(process.env.GIT_COMMIT) ||
      trimEnv(process.env.NUXT_PUBLIC_GIT_COMMIT) ||
      undefined,

    gitBranch:
      trimEnv(process.env.GIT_BRANCH) ||
      trimEnv(process.env.NUXT_PUBLIC_GIT_BRANCH) ||
      undefined,

    buildDate:
      trimEnv(process.env.BUILD_DATE) ||
      trimEnv(process.env.NUXT_PUBLIC_BUILD_DATE) ||
      undefined,

    environment:
      process.env.NODE_ENV || 'development',

    dbSchemaVersion: 0,
  }
}
