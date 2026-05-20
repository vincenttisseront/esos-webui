/**
 * Maps Administration cluster attention points into RAID cockpit actionable items.
 * Used when cluster-wide inventory detects issues the per-SAN overview peer scan may miss.
 */
import type { ClusterAttentionPoint } from '~/types/cluster-admin'
import type { RaidActionableItem } from '~/types/raid'
import { resolveClusterMdStorageMode } from '~/utils/cluster-md-symmetry'
import type { RaidCockpitTranslate } from '~/utils/raid-cluster-health-view-model'

function arrayNameFromAttentionId(id: string): string | undefined {
  const m = id.match(/^md_(?:warn|asym):(.+)$/)
  return m?.[1]
}

function isUuidMismatchSummary(summary: string): boolean {
  return summary.includes('UUID MD différents') || summary.toLowerCase().includes('different md uuid')
}

function isSymmetricLvmOnlyMdAsymmetry(id: string, summary: string): boolean {
  if (!id.startsWith('md_asym:')) return false
  return /est utilisé par LVM/i.test(summary) && !/pas de LVM sur/i.test(summary)
}

export function mapClusterStorageAttentionToRaidItems(
  points: ClusterAttentionPoint[],
  currentSanId: string,
  t: RaidCockpitTranslate,
): RaidActionableItem[] {
  const mode = resolveClusterMdStorageMode()
  const items: RaidActionableItem[] = []

  for (const p of points) {
    if (p.category !== 'storage_md' || p.severity === 'info') continue

    if (mode === 'local_symmetric' && isUuidMismatchSummary(p.summary)) {
      continue
    }

    if (mode === 'local_symmetric' && isSymmetricLvmOnlyMdAsymmetry(p.id, p.summary)) {
      continue
    }

    const arrayName = arrayNameFromAttentionId(p.id)
    const peerSanId = p.affectedNodeIds.find(id => id !== currentSanId)
    const peerIdx = peerSanId ? p.affectedNodeIds.indexOf(peerSanId) : -1
    const peerLabel = peerIdx >= 0 ? p.affectedNodeLabels[peerIdx] : undefined
    const severity = p.severity === 'blocking' || p.severity === 'critical' ? 'critical' as const : 'warning' as const

    if (mode === 'shared_identity' && isUuidMismatchSummary(p.summary)) {
      items.push({
        id: `attention:${p.id}`,
        severity,
        category: 'cluster_uuid_mismatch',
        title: t('raid.cockpit.item.cluster_uuid_mismatch.title'),
        impact: t('raid.cockpit.item.cluster_uuid_mismatch.impact'),
        recommendation: t('raid.cockpit.item.cluster_uuid_mismatch.recommendation', {
          uuids: p.summary,
        }),
        primaryActionLabel: peerLabel
          ? t('raid.cockpit.item.cluster_uuid_mismatch.action_peer', { label: peerLabel })
          : t('raid.cockpit.item.cluster_uuid_mismatch.action'),
        primaryActionTarget: peerSanId
          ? { type: 'navigate', tab: 'software', sanId: peerSanId }
          : {
              type: 'scroll',
              tab: 'software',
              anchor: 'raid-software-active',
              modal: 'cluster_recovery',
              arrayName,
            },
        details: [p.title, p.summary],
      })
      continue
    }

    items.push({
      id: `attention:${p.id}`,
      severity,
      category: 'cluster_structural_mismatch',
      title: p.title,
      impact: t('raid.cockpit.item.cluster_structural_mismatch.impact'),
      recommendation: p.summary,
      primaryActionLabel: peerLabel
        ? t('raid.cockpit.item.cluster_structural_mismatch.action_peer', { label: peerLabel })
        : t('raid.cockpit.item.cluster_structural_mismatch.action'),
      primaryActionTarget: peerSanId
        ? { type: 'navigate', tab: 'software', sanId: peerSanId }
        : {
            type: 'scroll',
            tab: 'software',
            anchor: 'raid-software-active',
            modal: 'cluster_recovery',
            arrayName,
          },
      details: [p.summary],
    })
  }

  return items
}

export function mergeAttentionWithoutDuplicates(
  existing: RaidActionableItem[],
  fromAttention: RaidActionableItem[],
): RaidActionableItem[] {
  const merged = [...existing]
  const seenIds = new Set(existing.map(i => i.id))

  function arrayTouched(item: RaidActionableItem): string | undefined {
    const fromId = item.id.match(/cluster_structural:([^:]+)/)?.[1]
      ?? item.id.match(/cluster_uuid_mismatch:(.+)$/)?.[1]
      ?? item.id.match(/attention:md_(?:warn|asym):(.+)$/)?.[1]
    if (fromId) return fromId
    const detail = item.details.find(d => /^md\d+/.test(d))
    return detail?.split(':')[0]?.trim()
  }

  const coveredArrays = new Set(
    existing
      .filter(i =>
        i.category === 'cluster_structural_mismatch'
        || i.category === 'cluster_uuid_mismatch'
        || i.category === 'cluster_asymmetry',
      )
      .map(arrayTouched)
      .filter(Boolean) as string[],
  )

  for (const item of fromAttention) {
    if (seenIds.has(item.id)) continue
    const arr = arrayTouched(item)
    if (arr && coveredArrays.has(arr)) continue
    seenIds.add(item.id)
    if (arr) coveredArrays.add(arr)
    merged.push(item)
  }

  return merged
}
