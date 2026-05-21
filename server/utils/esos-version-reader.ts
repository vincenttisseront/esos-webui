import { getActiveSSHManager } from './ssh-runtime'
import { withCache } from './cache'
import { compareSemver } from './semver'
import type { InstalledESOSVersion, BuildOption, GitHubTag, ESOSVersionDiff, ESOSVersionReport } from './types'
import { fetchESOSTags, pickLatestSemverTag } from './esos-github'

const BUILD_OPTIONS: Record<string, string> = {
  d: 'Debug (symboles non strippés)',
  g: 'GDB package inclus',
  v: 'Valgrind package inclus',
  s: 'strace package inclus',
  q: 'Driver QLogic 32Gb FC in-tree',
  z: 'ZFS/SPL packages inclus',
  m: 'mhVTL (deprecated)',
  e: 'EnhanceIO (deprecated)',
  b: 'BTIER (deprecated)',
  c: 'ATTO Celerity Gen6 FC driver',
  a: 'ATTO SCST target driver',
  o: 'Emulex OCS SDK target driver',
  u: 'Chelsio Uwire (deprecated)',
  M: 'Mellanox OFED driver stack',
  R: 'rapiddisk package',
}

export async function readInstalledESOSVersion(): Promise<InstalledESOSVersion> {
  const manager = getActiveSSHManager()

  const cmd = [
    'cat /etc/esos-release 2>/dev/null',
    "grep -oP '(?<=VERSION=).*' /etc/os-release 2>/dev/null",
    'uname -r',
  ].join(' || ')

  const result = await manager.exec(cmd, 8_000)
  const raw    = result.stdout.trim().split('\n')[0]?.trim() ?? ''

  return parseInstalledVersion(raw)
}

export function parseInstalledVersion(raw: string): InstalledESOSVersion {
  if (!raw) return { raw: '', buildType: 'unknown' }

  // Format master : "master_547868d_dgvszq" ou "master_abc1234_dg"
  const masterMatch = raw.match(/^(master)_([a-f0-9]{7,})_([a-zA-Z]*)$/)
  if (masterMatch) {
    const [, branch, commitHash, optsStr] = masterMatch
    const buildOpts: BuildOption[] = optsStr.split('').filter(Boolean).map(flag => ({
      flag,
      description: BUILD_OPTIONS[flag] ?? `Option inconnue (${flag})`,
    }))
    return { raw, buildType: 'master', branch, commitHash, buildOpts }
  }

  // Format stable : "3.0.1", "4.4.1", etc.
  const stableMatch = raw.match(/^(\d+\.\d+\.\d+)$/)
  if (stableMatch) {
    return { raw, buildType: 'stable', version: stableMatch[1] }
  }

  return { raw, buildType: 'unknown' }
}

export function computeVersionDiff(
  installed: InstalledESOSVersion,
  tags:      GitHubTag[],
): { diff: ESOSVersionDiff; behindCount: number } {
  if (!tags.length) return { diff: 'unknown', behindCount: 0 }

  if (installed.buildType === 'master') {
    return { diff: 'on-master', behindCount: 0 }
  }

  if (installed.buildType !== 'stable' || !installed.version) {
    return { diff: 'unknown', behindCount: 0 }
  }

  const latestTag = pickLatestSemverTag(tags)
  if (!latestTag) return { diff: 'unknown', behindCount: 0 }
  const diff      = compareSemver(installed.version, latestTag.name)

  const installedParts = installed.version.split('.').map(Number)
  const behindCount    = tags.filter(tag => {
    const parts = tag.name.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      if ((parts[i] ?? 0) > (installedParts[i] ?? 0)) return true
      if ((parts[i] ?? 0) < (installedParts[i] ?? 0)) return false
    }
    return false
  }).length

  return { diff: diff as ESOSVersionDiff, behindCount }
}

export async function buildVersionReport(): Promise<ESOSVersionReport> {
  return withCache('esos-version-report', 6 * 60 * 60 * 1000, async () => {
    const [installed, tags] = await Promise.all([
      readInstalledESOSVersion(),
      fetchESOSTags(),
    ])

    const { diff, behindCount } = computeVersionDiff(installed, tags)

    return {
      scannedAt:    Date.now(),
      installed,
      latestStable: pickLatestSemverTag(tags),
      allTags:      tags,
      diff,
      behindCount,
    }
  })
}
