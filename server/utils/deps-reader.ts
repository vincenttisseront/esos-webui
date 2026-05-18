import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { withCache } from './cache'
import { cleanVersion, compareSemver } from './semver'
import { fetchAllLatestVersions } from './npm-registry'
import type { DependenciesReport, DepType, PackageDep, SemverDiff } from './types'

interface RawPackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

interface InstalledPackage {
  name: string
  version: string
  type: DepType
}

export function readInstalledPackages(): InstalledPackage[] {
  const candidates = [
    resolve(process.cwd(), 'package.json'),
    resolve(process.cwd(), '..', 'package.json'),
    resolve(process.cwd(), '.output', 'package.json'),
    '/app/package.json',
  ]

  for (const pkgPath of candidates) {
    if (!existsSync(pkgPath)) continue

    try {
      const raw = JSON.parse(readFileSync(pkgPath, 'utf-8')) as RawPackageJson

      const packages: InstalledPackage[] = []

      for (const [name, version] of Object.entries(raw.dependencies ?? {})) {
        packages.push({ name, version, type: 'dependencies' })
      }

      for (const [name, version] of Object.entries(raw.devDependencies ?? {})) {
        packages.push({ name, version, type: 'devDependencies' })
      }

      return packages
    } catch {
      continue
    }
  }

  return []
}

export async function buildDependenciesReport(): Promise<DependenciesReport> {
  return withCache('dependencies-report', 3_600_000, async () => {
    const installed = readInstalledPackages()
    const latestMap = await fetchAllLatestVersions(installed)

    const packages: PackageDep[] = installed.map((pkg) => {
      const npm = latestMap.get(pkg.name)
      const clean = cleanVersion(pkg.version)
      const diff = npm?.version && !['unknown', 'timeout', 'error'].includes(npm.version)
        ? compareSemver(clean, npm.version)
        : 'unknown'

      return {
        name: pkg.name,
        installedVersion: pkg.version,
        installedClean: clean,
        latestVersion: npm?.version ?? 'unknown',
        diff,
        type: pkg.type,
        publishedAt: npm?.publishedAt ?? null,
        npmUrl: `https://www.npmjs.com/package/${pkg.name}`,
        repoUrl: npm?.repoUrl ?? null,
        description: npm?.description ?? '',
      }
    })

    const ORDER: Record<SemverDiff, number> = {
      major: 0,
      minor: 1,
      patch: 2,
      'up-to-date': 3,
      unknown: 4,
    }

    packages.sort((a, b) => {
      const diffCmp = ORDER[a.diff] - ORDER[b.diff]
      return diffCmp !== 0 ? diffCmp : a.name.localeCompare(b.name)
    })

    const majorUpdates = packages.filter((p) => p.diff === 'major').length
    const minorUpdates = packages.filter((p) => p.diff === 'minor').length
    const patchUpdates = packages.filter((p) => p.diff === 'patch').length

    return {
      scannedAt: Date.now(),
      totalCount: packages.length,
      outdated: majorUpdates + minorUpdates + patchUpdates,
      majorUpdates,
      minorUpdates,
      patchUpdates,
      packages,
    }
  })
}
