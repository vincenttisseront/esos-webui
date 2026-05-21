import type { ClusterNodeStatus, ClusterOverview } from './types'
import type {
  ClusterAttentionPoint,
  ClusterAttentionRecommendedAction,
  ClusterAttentionSeverity,
  ClusterHealth,
} from './cluster-admin-types'
import type { ClusterSanMember } from './cluster-resolve'
import type { MdDetectionItem } from './raid-md-detection'
import { buildMdDetectionSummary } from './raid-md-detection'
import { collectClusterStorageInventory } from './raid-cluster-storage-preflight'
import { buildClusterMdRecoveryAssessment } from './raid-cluster-md-node-state'

const SEVERITY_RANK: Record<ClusterAttentionSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
  blocking: 3,
}

function isMdAttentionItem(item: MdDetectionItem): boolean {
  if (item.recommendedAction && item.recommendedAction !== 'none') return true
  return item.severity === 'warning' || item.severity === 'blocking'
}

function mapMdSeverity(severity: MdDetectionItem['severity']): ClusterAttentionSeverity {
  if (severity === 'blocking') return 'blocking'
  if (severity === 'warning') return 'warning'
  return 'info'
}

function mdItemToAttention(item: MdDetectionItem): ClusterAttentionPoint {
  const sev = mapMdSeverity(item.severity)
  return {
    id: `md:${item.nodeSanId}:${item.path}:${item.kind}`,
    severity: sev === 'info' ? 'warning' : sev,
    category: 'storage_md',
    title: item.path,
    summary: item.summary.length > 120 ? `${item.summary.slice(0, 119)}…` : item.summary,
    affectedNodeIds: [item.nodeSanId],
    affectedNodeLabels: [item.nodeLabel],
    recommendedAction: 'open_raid',
    actionRoute: `/admin/sans/${item.nodeSanId}/raid`,
    actionPayload: { path: item.path, uiAnchor: item.uiAnchor },
    dismissible: false,
    source: 'md_detection',
    detectedAt: Date.now(),
  }
}

export function buildClusterAttentionFromStatus(
  overview: ClusterOverview,
  members: ClusterSanMember[],
  probeError?: string,
): ClusterAttentionPoint[] {
  const points: ClusterAttentionPoint[] = []
  const now = Date.now()

  if (probeError) {
    points.push({
      id: 'probe_error',
      severity: 'critical',
      category: 'connectivity',
      title: 'État cluster indisponible',
      summary: probeError,
      affectedNodeIds: members.map(m => m.id),
      affectedNodeLabels: members.map(m => m.label),
      recommendedAction: 'open_cluster_ha',
      actionRoute: overview.clusterId ? `/cluster?clusterId=${overview.clusterId}` : '/cluster',
      dismissible: false,
      source: 'cluster_status',
      detectedAt: now,
    })
    return points
  }

  if (members.length > 0 && !members.some(m => m.clusterRole === 'primary')) {
    points.push({
      id: 'no_primary',
      severity: 'critical',
      category: 'roles',
      title: 'Nœud primaire manquant',
      summary: 'Aucun nœud n\'est désigné primaire dans la base — les actions stockage cluster sont bloquées.',
      affectedNodeIds: members.map(m => m.id),
      affectedNodeLabels: members.map(m => m.label),
      recommendedAction: 'set_primary',
      actionRoute: overview.clusterId ? `/admin/cluster?clusterId=${overview.clusterId}` : '/admin/cluster',
      dismissible: false,
      source: 'san_registry',
      detectedAt: now,
    })
  }

  const readOnlyFlags = members.map(m => m.readOnly)
  if (readOnlyFlags.some(Boolean) && readOnlyFlags.some(r => !r)) {
    points.push({
      id: 'read_only_mismatch',
      severity: 'warning',
      category: 'config',
      title: 'Lecture seule incohérente',
      summary: 'Les nœuds du cluster n\'ont pas le même mode édition WebUI.',
      affectedNodeIds: members.filter(m => m.readOnly).map(m => m.id),
      affectedNodeLabels: members.filter(m => m.readOnly).map(m => m.label),
      recommendedAction: 'open_cluster_ha',
      actionRoute: overview.clusterId ? `/admin/sans?clusterId=${overview.clusterId}` : '/admin/sans',
      dismissible: false,
      source: 'config',
      detectedAt: now,
    })
  }

  if (overview.mode === 'resyncing') {
    const syncingNodes = overview.nodes.filter(n =>
      n.drbd.resources.some(r => r.isSyncing),
    )
    if (syncingNodes.length) {
      points.push({
        id: 'drbd_resyncing',
        severity: 'warning',
        category: 'storage_replication',
        title: 'Resynchronisation DRBD en cours',
        summary: 'Une ou plusieurs ressources DRBD sont en cours de resync — évitez les basculements forcés.',
        affectedNodeIds: syncingNodes.map(n => n.nodeId),
        affectedNodeLabels: syncingNodes.map(n => n.hostname),
        recommendedAction: 'open_cluster_ha',
        actionRoute: overview.clusterId ? `/cluster?clusterId=${overview.clusterId}` : '/cluster',
        dismissible: false,
        source: 'cluster_status',
        detectedAt: now,
      })
    }
  }

  if (overview.mode === 'split-brain') {
    points.push({
      id: 'drbd_split_brain',
      severity: 'critical',
      category: 'storage_replication',
      title: 'Split-brain DRBD',
      summary: 'Au moins une ressource DRBD est en état StandAlone — intervention requise.',
      affectedNodeIds: overview.nodes.map(n => n.nodeId),
      affectedNodeLabels: overview.nodes.map(n => n.hostname),
      recommendedAction: 'open_cluster_ha',
      actionRoute: overview.clusterId ? `/cluster?clusterId=${overview.clusterId}` : '/cluster',
      dismissible: false,
      source: 'cluster_status',
      detectedAt: now,
    })
  }

  for (const node of overview.nodes) {
    if (!node.sshReady) {
      points.push(nodeAttention(node, {
        id: `ssh:${node.nodeId}`,
        severity: 'critical',
        category: 'connectivity',
        title: `SSH indisponible — ${node.hostname}`,
        summary: 'Le nœud ne répond pas via SSH — reconnectez ou vérifiez le réseau.',
        recommendedAction: 'reconnect',
      }))
      continue
    }
    if (!node.corosyncRunning || !node.pacemakerRunning) {
      points.push(nodeAttention(node, {
        id: `services:${node.nodeId}`,
        severity: 'critical',
        category: 'cluster_services',
        title: `Services HA arrêtés — ${node.hostname}`,
        summary: `Corosync: ${node.corosyncRunning ? 'OK' : 'arrêté'} · Pacemaker: ${node.pacemakerRunning ? 'OK' : 'arrêté'}`,
        recommendedAction: 'open_cluster_ha',
      }))
    }
    if (node.pacemakerRunning && !node.quorate) {
      points.push(nodeAttention(node, {
        id: `quorum:${node.nodeId}`,
        severity: 'critical',
        category: 'cluster_services',
        title: `Quorum perdu — ${node.hostname}`,
        summary: 'Le cluster n\'est pas quorate selon corosync-quorumtool.',
        recommendedAction: 'open_cluster_ha',
      }))
    }
    for (const res of node.resources) {
      if (res.state === 'Stopped' || res.state === 'Unknown') {
        points.push(nodeAttention(node, {
          id: `resource:${node.nodeId}:${res.id}`,
          severity: 'warning',
          category: 'cluster_services',
          title: `Ressource ${res.id} — ${res.state}`,
          summary: `Ressource Pacemaker ${res.type} sur ${node.hostname}.`,
          recommendedAction: 'open_cluster_ha',
        }))
      }
    }
  }

  return dedupeAttention(points)
}

function nodeAttention(
  node: ClusterNodeStatus,
  partial: Omit<ClusterAttentionPoint, 'affectedNodeIds' | 'affectedNodeLabels' | 'dismissible' | 'source' | 'detectedAt' | 'actionRoute'> & {
    recommendedAction: ClusterAttentionRecommendedAction
    actionRoute?: string
  },
): ClusterAttentionPoint {
  return {
    ...partial,
    affectedNodeIds: [node.nodeId],
    affectedNodeLabels: [node.hostname],
    actionRoute: partial.actionRoute,
    dismissible: false,
    source: 'cluster_status',
    detectedAt: Date.now(),
  }
}

export async function appendMdAttentionPoints(
  clusterId: string,
  points: ClusterAttentionPoint[],
  primarySanId?: string,
): Promise<ClusterAttentionPoint[]> {
  const merged = [...points]
  try {
    const inventories = await collectClusterStorageInventory({ clusterId })
    for (const inv of inventories) {
      if (!inv.sshReady) continue
      const summary = buildMdDetectionSummary({
        nodeSanId: inv.sanId,
        nodeLabel: inv.label,
        mdArrays: inv.mdArrays,
        stoppedMdArrays: inv.stoppedMdArrays ?? [],
        blockDevices: inv.blockDevices,
      })
      for (const item of summary.items) {
        if (isMdAttentionItem(item)) merged.push(mdItemToAttention(item))
      }
    }

    const arrayNames = new Set<string>()
    for (const inv of inventories) {
      for (const arr of inv.mdArrays) arrayNames.add(arr.name)
      for (const arr of inv.stoppedMdArrays ?? []) {
        if (arr.name && arr.name !== 'unknown') arrayNames.add(arr.name)
      }
    }
    const primary = primarySanId ?? inventories.find(i => i.role === 'primary')?.sanId ?? inventories[0]?.sanId
    let lvmInventories: Array<{
      sanId: string
      label: string
      mdArrays: import('./raid-types').MdArray[]
      pvs: Array<{ path: string; vgName: string }>
    }> = []
    try {
      const { collectClusterLvmInventory } = await import('./lvm-cluster-preflight')
      const lvmNodes = await collectClusterLvmInventory(clusterId)
      lvmInventories = lvmNodes.map(n => ({
        sanId: n.sanId,
        label: n.label,
        mdArrays: inventories.find(i => i.sanId === n.sanId)?.mdArrays ?? [],
        pvs: n.overview.pvs.map(p => ({ path: p.path, vgName: p.vgName })),
      }))
    } catch {
      lvmInventories = inventories.map(inv => ({
        sanId: inv.sanId,
        label: inv.label,
        mdArrays: inv.mdArrays,
        pvs: [],
      }))
    }

    const {
      assessMdLvmClusterSymmetry,
      collectMdArrayLvmStates,
      filterMdClusterAsymmetryHardBlockers,
    } = await import('../../utils/md-lvm-cluster-symmetry')
    const { filterMdHealthWarnings } = await import('../../utils/cluster-md-symmetry')

    if (primary) {
      for (const name of arrayNames) {
        try {
          const assessment = buildClusterMdRecoveryAssessment({
            action: 'stop_md',
            arrayName: name,
            nodes: inventories,
          })
          const mdLvmStates = collectMdArrayLvmStates(lvmInventories, name)
          const mdLvmIssues = assessMdLvmClusterSymmetry(mdLvmStates)
          const asymmetryBlockers = filterMdClusterAsymmetryHardBlockers(
            assessment.hardBlockers,
            mdLvmIssues,
          )

          for (const issue of mdLvmIssues) {
            merged.push({
              id: `md_lvm:${name}:${issue.message.slice(0, 48)}`,
              severity: issue.severity === 'critical' ? 'blocking' : 'warning',
              category: 'storage_md',
              title: issue.severity === 'critical'
                ? `MD ${name} — LVM asymétrique`
                : `MD ${name} — LVM`,
              summary: issue.message,
              affectedNodeIds: mdLvmStates.map(s => s.sanId),
              affectedNodeLabels: mdLvmStates.map(s => s.label),
              recommendedAction: issue.severity === 'critical' ? 'open_raid' : 'open_raid',
              actionRoute: `/admin/sans/${primary}/raid`,
              actionPayload: { arrayName: name, tab: 'lvm' },
              dismissible: false,
              source: 'md_detection',
              detectedAt: Date.now(),
            })
          }

          if (asymmetryBlockers.length) {
            merged.push({
              id: `md_asym:${name}`,
              severity: 'blocking',
              category: 'storage_md',
              title: `MD ${name} — asymétrie cluster`,
              summary: asymmetryBlockers[0] ?? 'État MD incohérent entre nœuds',
              affectedNodeIds: assessment.nodeReports.map(r => r.sanId),
              affectedNodeLabels: assessment.nodeReports.map(r => r.label),
              recommendedAction: 'run_recovery',
              actionRoute: `/admin/sans/${primary}/raid`,
              actionPayload: { arrayName: name },
              dismissible: false,
              source: 'md_detection',
              detectedAt: Date.now(),
            })
          } else if (!assessment.structurallySymmetric && filterMdHealthWarnings(assessment.warnings).length) {
            const healthWarnings = filterMdHealthWarnings(assessment.warnings)
            merged.push({
              id: `md_warn:${name}`,
              severity: 'warning',
              category: 'storage_md',
              title: `MD ${name} — état dégradé`,
              summary: healthWarnings[0] ?? 'Symétrie MD non confirmée',
              affectedNodeIds: assessment.nodeReports.map(r => r.sanId),
              affectedNodeLabels: assessment.nodeReports.map(r => r.label),
              recommendedAction: 'open_raid',
              actionRoute: `/admin/sans/${primary}/raid`,
              dismissible: false,
              source: 'md_detection',
              detectedAt: Date.now(),
            })
          }
        } catch {
          // skip array assessment errors
        }
      }
    }
  } catch {
    // MD inventory optional for attention
  }
  return dedupeAttention(merged)
}

export async function appendLvmAttentionPoints(
  _clusterId: string,
  points: ClusterAttentionPoint[],
  primarySanId?: string,
): Promise<ClusterAttentionPoint[]> {
  const merged = [...points]
  try {
    const { loadClusterPeerLvmDetection } = await import('./lvm-cluster-execution')
    const { collectLvmOverview } = await import('./lvm-overview.service')
    const { getSSHPool } = await import('./ssh-pool')
    const { findLvmStructuralIssues } = await import('../../utils/lvm-cluster-symmetry')
    const { getSanSummary } = await import('../db/repositories/san.repository')

    const primary = primarySanId
    if (!primary) return merged
    const manager = getSSHPool().get(primary)
    if (!manager || manager.getStatus() !== 'connected') return merged

    const local = await collectLvmOverview(manager)
    const peers = await loadClusterPeerLvmDetection(primary)
    const issues = findLvmStructuralIssues({ vgs: local.vgs, pvs: local.pvs }, peers)
    const primaryLabel = getSanSummary(primary)?.label ?? primary

    for (const issue of issues) {
      merged.push({
        id: `lvm_struct:${issue.vgName}:${issue.message.slice(0, 40)}`,
        severity: issue.severity === 'critical' ? 'critical' : 'warning',
        category: 'storage_lvm',
        title: `LVM ${issue.vgName}`,
        summary: issue.message,
        affectedNodeIds: [primary, ...peers.map(p => p.nodeSanId)],
        affectedNodeLabels: [primaryLabel, ...peers.map(p => p.nodeLabel)],
        recommendedAction: 'open_raid',
        actionRoute: `/admin/sans/${primary}/raid`,
        actionPayload: { tab: 'lvm' },
        dismissible: false,
        source: 'md_detection',
        detectedAt: Date.now(),
      })
    }
  } catch {
    // optional
  }
  return dedupeAttention(merged)
}

function dedupeAttention(points: ClusterAttentionPoint[]): ClusterAttentionPoint[] {
  const map = new Map<string, ClusterAttentionPoint>()
  for (const p of points) {
    const existing = map.get(p.id)
    if (!existing || SEVERITY_RANK[p.severity] > SEVERITY_RANK[existing.severity]) {
      map.set(p.id, p)
    }
  }
  return [...map.values()].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
}

import { readClusterMemberVersions } from './cluster-version'
import { getSanSetting } from '../db/repositories/san.repository'
import type { ClusterStorageConsistencyResult } from './cluster-admin-types'

const SYNC_STALE_MS = 7 * 24 * 60 * 60 * 1000

export async function appendRegistryAttentionPoints(
  clusterId: string,
  members: ClusterSanMember[],
  points: ClusterAttentionPoint[],
  primarySanId?: string,
): Promise<ClusterAttentionPoint[]> {
  const merged = [...points]
  const now = Date.now()
  const primary = primarySanId ?? members.find(m => m.clusterRole === 'primary')?.id

  if (primary && members.length > 1) {
    const lastSyncRaw = getSanSetting(primary, 'cluster_last_sync_at')
    const lastSync = lastSyncRaw ? Number(lastSyncRaw) : 0
    if (!lastSync || now - lastSync > SYNC_STALE_MS) {
      merged.push({
        id: 'config_sync_stale',
        severity: 'warning',
        category: 'config_sync',
        title: 'Synchronisation configuration recommandée',
        summary: lastSync
          ? 'La dernière synchronisation conf_sync date de plus de 7 jours.'
          : 'Aucune synchronisation conf_sync enregistrée pour ce cluster.',
        affectedNodeIds: members.map(m => m.id),
        affectedNodeLabels: members.map(m => m.label),
        recommendedAction: 'sync_config',
        actionPayload: { clusterId },
        dismissible: false,
        source: 'config_sync',
        detectedAt: now,
      })
    }
  }

  try {
    const versions = await readClusterMemberVersions(members)
    const known = versions.filter(v => v.normalized)
    if (known.length >= 2) {
      const unique = new Set(known.map(v => v.normalized))
      if (unique.size > 1) {
        merged.push({
          id: 'version_mismatch',
          severity: 'warning',
          category: 'version',
          title: 'Versions ESOS différentes',
          summary: `Versions détectées : ${[...unique].join(' · ')} — alignez les builds avant d\'ajouter un nœud.`,
          affectedNodeIds: known.map(v => v.sanId),
          affectedNodeLabels: known.map(v => v.label),
          recommendedAction: 'open_cluster_ha',
          actionRoute: `/cluster?clusterId=${clusterId}`,
          dismissible: false,
          source: 'version',
          detectedAt: now,
        })
      }
    }
  } catch {
    // version check optional
  }

  return dedupeAttention(merged)
}

export function appendScstAttentionPoints(
  clusterId: string,
  points: ClusterAttentionPoint[],
  storage: ClusterStorageConsistencyResult,
  primarySanId?: string,
): ClusterAttentionPoint[] {
  if (!storage.scst.checked || storage.scst.symmetric !== false) return points
  const merged = [...points]
  merged.push({
    id: 'scst_asymmetry',
    severity: 'warning',
    category: 'scst',
    title: 'Cohérence SCST / ALUA',
    summary: storage.scst.summary,
    affectedNodeIds: storage.nodes.map(n => n.sanId),
    affectedNodeLabels: storage.nodes.map(n => n.label),
    recommendedAction: 'open_cluster_ha',
    actionRoute: `/cluster?clusterId=${clusterId}`,
    dismissible: false,
    source: 'scst',
    detectedAt: Date.now(),
  })
  if (primarySanId) {
    const scst = merged[merged.length - 1]
    if (scst) scst.actionRoute = `/cluster?clusterId=${clusterId}`
  }
  return dedupeAttention(merged)
}

export { deriveClusterHealth, mergeClusterHealth, storageOverallToHealth } from './cluster-health'
