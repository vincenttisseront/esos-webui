import { resolveLatestStableRelease, fetchESOSTagsLite } from './esos-github'
import { compareSemver, relativeSemver } from './semver'
import type { InstalledESOSVersion } from './types'
import type {
  UpgradeNodeReadiness,
  UpgradeNodeVersionStatus,
  UpgradeVersionAvailability,
  UpgradeVersionAvailabilityOverall,
  UpgradeVersionDiffKind,
} from '~/types/upgrade'

function countTagsBehind(installedVersion: string, tags: { name: string }[]): number {
  const installedParts = installedVersion.split('.').map(Number)
  return tags.filter((tag) => {
    const parts = tag.name.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      if ((parts[i] ?? 0) > (installedParts[i] ?? 0)) return true
      if ((parts[i] ?? 0) < (installedParts[i] ?? 0)) return false
    }
    return false
  }).length
}

function evaluateNodeStatus(
  installed: InstalledESOSVersion,
  latestVersion: string | null,
  githubOk: boolean,
): {
  status: UpgradeNodeVersionStatus
  diff: UpgradeVersionDiffKind
  behindCount?: number
} {
  if (!githubOk || !latestVersion) {
    if (installed.buildType === 'master') {
      return { status: 'on-master', diff: null }
    }
    return { status: 'not-comparable', diff: null }
  }

  if (installed.buildType === 'master') {
    return { status: 'on-master', diff: null }
  }

  if (installed.buildType !== 'stable' || !installed.version) {
    return { status: 'not-comparable', diff: null }
  }

  const rel = relativeSemver(installed.version, latestVersion)
  if (rel === 'invalid') {
    return { status: 'not-comparable', diff: null }
  }
  if (rel === 'equal') {
    return { status: 'up-to-date', diff: null }
  }
  if (rel === 'ahead') {
    return { status: 'ahead-of-release', diff: null }
  }

  const diff = compareSemver(installed.version, latestVersion)
  const diffKind: UpgradeVersionDiffKind =
    diff === 'major' || diff === 'minor' || diff === 'patch' ? diff : null

  return { status: 'upgrade-available', diff: diffKind }
}

function aggregateOverall(
  nodeStatuses: UpgradeNodeVersionStatus[],
  githubOk: boolean,
): UpgradeVersionAvailabilityOverall {
  if (!githubOk) return 'github-unavailable'

  const comparable = nodeStatuses.filter(s =>
    s === 'up-to-date' || s === 'upgrade-available' || s === 'ahead-of-release',
  )
  if (comparable.length === 0) {
    if (nodeStatuses.every(s => s === 'on-master')) return 'on-master'
    return 'not-comparable'
  }

  const hasUpgrade = nodeStatuses.some(s => s === 'upgrade-available')
  const allCurrent = nodeStatuses.every(s =>
    s === 'up-to-date' || s === 'ahead-of-release' || s === 'on-master' || s === 'not-comparable',
  )

  if (hasUpgrade) {
    const behind = nodeStatuses.filter(s => s === 'upgrade-available')
    const upToDate = nodeStatuses.filter(s => s === 'up-to-date' || s === 'ahead-of-release')
    if (behind.length > 0 && upToDate.length > 0) return 'mixed'
    return 'upgrade-available'
  }

  if (allCurrent && !hasUpgrade) {
    if (nodeStatuses.some(s => s === 'on-master')) return 'on-master'
    if (nodeStatuses.every(s => s === 'not-comparable')) return 'not-comparable'
    return 'up-to-date'
  }

  return 'mixed'
}

function githubUsable(github: Awaited<ReturnType<typeof resolveLatestStableRelease>>): boolean {
  return github.ok || (github.meta?.source === 'stale' && !!github.latest)
}

export async function buildUpgradeVersionAvailability(
  nodes: UpgradeNodeReadiness[],
): Promise<UpgradeVersionAvailability> {
  const github = await resolveLatestStableRelease()
  const latest = github.latest
  const latestVersion = latest?.name ?? null
  const ok = githubUsable(github)

  let semverTags: { name: string }[] = []
  let tagsMeta = github.meta
  if (ok) {
    const needsBehind = nodes.some(
      n => n.installed.buildType === 'stable' && n.installed.version,
    )
    if (needsBehind) {
      const lite = await fetchESOSTagsLite()
      semverTags = lite.tags
      tagsMeta = lite.meta
    } else if (latest) {
      semverTags = [latest]
    }
  }

  const nodeResults = nodes.map((node) => {
    const { status, diff, behindCount: _bc } = evaluateNodeStatus(
      node.installed,
      latestVersion,
      ok,
    )
    let behindCount: number | undefined
    if (
      ok
      && status === 'upgrade-available'
      && node.installed.buildType === 'stable'
      && node.installed.version
    ) {
      behindCount = countTagsBehind(node.installed.version, semverTags)
    }
    return {
      sanId: node.sanId,
      label: node.label,
      status,
      installed: node.installed,
      diff,
      behindCount,
    }
  })

  const overall = aggregateOverall(nodeResults.map(n => n.status), ok)

  const githubSource = github.meta?.source ?? tagsMeta?.source
  const githubCheckedAt = Math.max(
    github.meta?.fetchedAt ?? 0,
    tagsMeta?.fetchedAt ?? 0,
  ) || undefined

  return {
    githubOk: ok,
    githubError: ok ? undefined : github.error,
    githubMessage: ok && github.meta?.source === 'stale'
      ? github.message ?? github.meta.error
      : github.message,
    githubCheckedAt,
    githubSource,
    latestStable: latest
      ? {
          version: latest.name,
          name: latest.name,
          downloadUrl: latest.downloadUrl,
        }
      : null,
    overall,
    nodes: nodeResults,
  }
}

export function versionSummaryCodes(availability: UpgradeVersionAvailability): string[] {
  const codes: string[] = []
  if (availability.overall === 'github-unavailable') {
    codes.push('admin.upgrade.summary.version_github_unavailable')
  } else if (availability.overall === 'up-to-date') {
    codes.push('admin.upgrade.summary.version_up_to_date')
  } else if (availability.overall === 'upgrade-available') {
    codes.push('admin.upgrade.summary.version_upgrade_available')
  } else if (availability.overall === 'mixed') {
    codes.push('admin.upgrade.summary.version_mixed')
  } else if (availability.overall === 'on-master') {
    codes.push('admin.upgrade.summary.version_on_master')
  } else if (availability.overall === 'not-comparable') {
    codes.push('admin.upgrade.summary.version_not_comparable')
  }
  return codes
}
