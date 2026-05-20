import { createError } from 'h3'
import { and, eq } from 'drizzle-orm'
import { getDB } from '../db'
import { sans } from '../db/schema'
import { getSSHPool } from './ssh-pool'
import { collectLvmOverview } from './lvm-overview.service'
import { collectRaidOverview } from './raid-overview.service'
import { runLvmPreflight } from './lvm-preflight'
import { mapDeviceToPeer } from './raid-cluster-storage-preflight'
import type { ClusterStorageNodeInventory, MdArray } from './raid-types'
import type {
  ClusterLvmDiskMapping,
  ClusterLvmNodeInventory,
  ClusterLvmPreflightResult,
  LvmPreflightRequest,
  PvCreatePayload,
  PvRemovePayload,
  VgCreatePayload,
  VgRemovePayload,
  LvCreatePayload,
  LvRemovePayload,
} from './lvm-types'
import { assessLocalSymmetricLvm } from '../../utils/lvm-cluster-symmetry'
import { validateClusterPvCreatePaths } from './lvm-cluster-pv-validation'

const MD_PATH_RE = /^\/dev\/md[a-z0-9_-]{0,15}$/i
const SIZE_TOLERANCE_RATIO = 0.01
const SIZE_TOLERANCE_MIN_BYTES = 4 * 1024 * 1024

function sizeWithinTolerance(a?: number, b?: number): boolean {
  if (a == null || b == null) return true
  const diff = Math.abs(a - b)
  const max = Math.max(a, b, 1)
  return diff <= Math.max(SIZE_TOLERANCE_MIN_BYTES, max * SIZE_TOLERANCE_RATIO)
}

function mdStructurallyMatches(a: MdArray, b: MdArray): boolean {
  return a.raidLevel === b.raidLevel
    && a.raidDevices === b.raidDevices
    && a.activeDevices === b.activeDevices
    && a.failedDevices === 0
    && b.failedDevices === 0
    && sizeWithinTolerance(a.sizeBytes, b.sizeBytes)
}

function resolveClusterNodes(input: { clusterId: string; nodeIds?: string[] }) {
  const rows = getDB()
    .select({
      id: sans.id,
      label: sans.label,
      clusterRole: sans.clusterRole,
      readOnly: sans.readOnly,
    })
    .from(sans)
    .where(and(eq(sans.clusterId, input.clusterId), eq(sans.clusterEnabled, true)))
    .all()
  if (input.nodeIds?.length) {
    const set = new Set(input.nodeIds)
    return rows.filter(r => set.has(r.id))
  }
  return rows
}

async function collectNodeLvmInventory(node: {
  id: string
  label: string
  clusterRole: string | null
  readOnly: boolean
}): Promise<ClusterLvmNodeInventory> {
  const emptyOverview = {
    scannedAt: Date.now(),
    tools: { pvs: false, vgs: false, lvs: false, pvcreate: false, vgcreate: false, lvcreate: false, vgremove: false, lvremove: false, pvremove: false, wipefs: false, blkid: false },
    pvs: [],
    vgs: [],
    lvs: [],
    candidates: [],
    alerts: [],
  }
  const manager = getSSHPool().get(node.id)
  if (!manager || manager.getStatus() !== 'connected') {
    return {
      sanId: node.id,
      label: node.label,
      role: node.clusterRole,
      readOnly: node.readOnly,
      sshReady: false,
      error: 'SSH non connecté',
      overview: emptyOverview,
      mdArrayNames: [],
      mdArrays: [],
      blockDevices: [],
    }
  }
  try {
    const [overview, raid] = await Promise.all([
      collectLvmOverview(manager),
      collectRaidOverview(manager),
    ])
    return {
      sanId: node.id,
      label: node.label,
      role: node.clusterRole,
      readOnly: node.readOnly,
      sshReady: true,
      overview,
      mdArrayNames: raid.mdArrays.map(a => a.name),
      mdArrays: raid.mdArrays,
      blockDevices: raid.blockDevices,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur scan'
    return {
      sanId: node.id,
      label: node.label,
      role: node.clusterRole,
      readOnly: node.readOnly,
      sshReady: false,
      error: msg,
      overview: emptyOverview,
      mdArrayNames: [],
      mdArrays: [],
      blockDevices: [],
    }
  }
}

export async function collectClusterLvmInventory(clusterId: string): Promise<ClusterLvmNodeInventory[]> {
  const nodes = resolveClusterNodes({ clusterId })
  return Promise.all(nodes.map(collectNodeLvmInventory))
}

export function mapPvPathToPeer(
  sourcePath: string,
  source: ClusterLvmNodeInventory,
  peer: ClusterLvmNodeInventory,
  manualMappings: ClusterLvmDiskMapping[] = [],
): { peerPath?: string; confidence: 'high' | 'medium' | 'low' | 'none'; blockers: string[]; warnings: string[] } {
  const manual = manualMappings.find(
    m => m.sourceSanId === source.sanId && m.peerSanId === peer.sanId && m.sourcePath === sourcePath,
  )
  if (manual?.peerPath) {
    return { peerPath: manual.peerPath, confidence: 'high', blockers: [], warnings: [] }
  }

  const blockers: string[] = []
  const warnings: string[] = []

  if (MD_PATH_RE.test(sourcePath)) {
    const arrayName = sourcePath.replace(/^\/dev\//, '')
    const srcArr = source.mdArrays?.find(a => a.name === arrayName || a.path === sourcePath)
    const peerArr = peer.mdArrays?.find(a => a.name === arrayName || a.path === sourcePath)
    if (srcArr && peerArr) {
      if (!mdStructurallyMatches(srcArr, peerArr)) {
        blockers.push(`${sourcePath} : structure MD différente sur ${peer.label}`)
        return { peerPath: undefined, confidence: 'none', blockers, warnings }
      }
      const peerCand = peer.overview.candidates.find(c => c.path === sourcePath)
      if (peerCand && !peerCand.eligible) {
        blockers.push(`${sourcePath} non éligible sur ${peer.label} : ${peerCand.reasons.join(', ')}`)
        return { peerPath: undefined, confidence: 'none', blockers, warnings }
      }
      return { peerPath: sourcePath, confidence: 'high', blockers, warnings: ['Mapping symétrique local : même chemin MD'] }
    }
    if (!peerArr) blockers.push(`${arrayName} absent sur ${peer.label}`)
    return { peerPath: undefined, confidence: 'none', blockers, warnings }
  }

  const sourceStorage = toStorageInventory(source)
  const peerStorage = toStorageInventory(peer)
  const mapping = mapDeviceToPeer(
    sourcePath,
    sourceStorage,
    peerStorage,
    'create_md',
    manualMappings.map(m => ({
      sourcePath: m.sourcePath,
      targetSanId: m.peerSanId,
      targetPath: m.peerPath,
      operatorConfirmed: true,
    })),
  )
  if (mapping.targetPath && mapping.confidence !== 'none') {
    return {
      peerPath: mapping.targetPath,
      confidence: mapping.confidence === 'high' ? 'high' : mapping.confidence === 'medium' ? 'medium' : 'low',
      blockers: mapping.blockers,
      warnings: mapping.warnings,
    }
  }
  return { peerPath: undefined, confidence: 'none', blockers: [...mapping.blockers, ...blockers], warnings }
}

function toStorageInventory(node: ClusterLvmNodeInventory): ClusterStorageNodeInventory {
  return {
    sanId: node.sanId,
    label: node.label,
    role: node.role,
    readOnly: node.readOnly,
    sshReady: node.sshReady,
    error: node.error,
    tools: node.overview.tools as ClusterStorageNodeInventory['tools'],
    blockDevices: node.blockDevices ?? [],
    mdArrays: node.mdArrays ?? [],
    stoppedMdArrays: [],
  }
}

export function buildClusterLvmDiskMappings(
  primarySanId: string,
  sourcePath: string,
  inventories: ClusterLvmNodeInventory[],
  manualMappings: ClusterLvmDiskMapping[] = [],
): ClusterLvmDiskMapping[] {
  const source = inventories.find(n => n.sanId === primarySanId)
  if (!source) return []
  const mappings: ClusterLvmDiskMapping[] = []
  for (const peer of inventories.filter(n => n.sanId !== primarySanId)) {
    const result = mapPvPathToPeer(sourcePath, source, peer, manualMappings)
    if (result.peerPath) {
      mappings.push({
        sourceSanId: primarySanId,
        peerSanId: peer.sanId,
        sourcePath,
        peerPath: result.peerPath,
        stableKey: sourcePath,
      })
    }
  }
  return mappings
}

export function resolvePeerPvPaths(
  primarySanId: string,
  pvPaths: string[],
  peerSanId: string,
  inventories: ClusterLvmNodeInventory[],
  mappings: ClusterLvmDiskMapping[] = [],
): string[] {
  return pvPaths.map((sp) => {
    const mapped = mappings.find(m => m.sourcePath === sp && m.peerSanId === peerSanId)
      ?? buildClusterLvmDiskMappings(primarySanId, sp, inventories, mappings).find(m => m.peerSanId === peerSanId)
    if (mapped?.peerPath) return mapped.peerPath
    const peer = inventories.find(n => n.sanId === peerSanId)
    const orphan = peer?.overview.pvs.find(p => !p.vgName && p.path === sp)
    return orphan ? sp : ''
  }).filter(Boolean)
}

export async function runClusterLvmPreflight(
  clusterId: string,
  primarySanId: string,
  req: LvmPreflightRequest,
): Promise<ClusterLvmPreflightResult> {
  const nodes = await collectClusterLvmInventory(clusterId)
  if (nodes.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Au moins deux nœuds cluster requis' })
  }
  const blockers: string[] = []
  const warnings: string[] = []
  let mappings: ClusterLvmDiskMapping[] = req.clusterExecution?.diskMappings ?? []

  const primary = nodes.find(n => n.sanId === primarySanId)
  if (!primary?.sshReady) blockers.push('Nœud primaire inaccessible')

  for (const node of nodes) {
    if (!node.sshReady) blockers.push(`${node.label} : SSH non disponible`)
    if (node.readOnly) blockers.push(`${node.label} : lecture seule`)
    if (node.overview.vgs.some(v => v.clustered)) {
      blockers.push(`${node.label} : VG clvmd détecté — non supporté`)
    }
  }

  const peerSnapshots = nodes
    .filter(n => n.sanId !== primarySanId && n.sshReady)
    .map(n => ({
      nodeSanId: n.sanId,
      nodeLabel: n.label,
      pvs: n.overview.pvs,
      vgs: n.overview.vgs,
      lvs: n.overview.lvs,
      candidates: n.overview.candidates,
    }))
  const symmetryIssues: ClusterLvmPreflightResult['symmetryIssues'] = []
  if (primary) {
    const symmetry = assessLocalSymmetricLvm(
      { pvs: primary.overview.pvs, vgs: primary.overview.vgs, lvs: primary.overview.lvs },
      peerSnapshots,
    )
    for (const issue of symmetry) {
      symmetryIssues.push(issue)
      const line = issue.lvName
        ? `LV ${issue.vgName}/${issue.lvName}`
        : issue.vgName
          ? `VG ${issue.vgName}`
          : 'Cluster'
      if (issue.severity === 'critical') blockers.push(`${line} : ${issue.message}`)
      else warnings.push(`${line} : ${issue.message}`)
    }
  }

  if (req.action === 'pvcreate' && primary) {
    const payload = req.payload as PvCreatePayload
    if (!mappings.length) {
      mappings = buildClusterLvmDiskMappings(primarySanId, payload.path, nodes)
    }
    blockers.push(...validateClusterPvCreatePaths(
      primarySanId,
      payload.path,
      nodes,
      mappings,
      !!payload.force,
    ))
    for (const node of nodes) {
      const path = node.sanId === primarySanId
        ? payload.path
        : mappings.find(m => m.peerSanId === node.sanId && m.sourcePath === payload.path)?.peerPath
      if (!path) {
        blockers.push(`${node.label} : chemin PV non mappé`)
        continue
      }
      if (!node.sshReady) continue
      const manager = getSSHPool().get(node.sanId)!
      const pre = await runLvmPreflight(manager, {
        action: 'pvcreate',
        payload: { ...payload, path, confirmation: '' },
      }, node.overview)
      blockers.push(...pre.blockers.map(b => `${node.label}: ${b}`))
      warnings.push(...pre.warnings.map(w => `${node.label}: ${w}`))
    }
  }

  if (req.action === 'vgcreate' && primary) {
    const payload = req.payload as VgCreatePayload
    for (const node of nodes) {
      if (!node.sshReady) continue
      if (node.overview.vgs.some(v => v.name === payload.name)) {
        blockers.push(`${node.label} : VG ${payload.name} existe déjà`)
      }
    }
    for (const node of nodes) {
      if (!node.sshReady) continue
      const pvPaths = node.sanId === primarySanId
        ? payload.pvPaths
        : resolvePeerPvPaths(primarySanId, payload.pvPaths, node.sanId, nodes, mappings)
      if (!pvPaths.length) blockers.push(`${node.label} : PV non mappés pour vgcreate`)
      const manager = getSSHPool().get(node.sanId)!
      const pre = await runLvmPreflight(manager, {
        action: 'vgcreate',
        payload: { name: payload.name, pvPaths, confirmation: '' },
      }, node.overview)
      blockers.push(...pre.blockers.map(b => `${node.label}: ${b}`))
    }
  }

  if (req.action === 'pvremove' && primary) {
    const payload = req.payload as PvRemovePayload
    if (!mappings.length) {
      mappings = buildClusterLvmDiskMappings(primarySanId, payload.path, nodes)
    }
    for (const node of nodes) {
      const path = node.sanId === primarySanId
        ? payload.path
        : mappings.find(m => m.peerSanId === node.sanId && m.sourcePath === payload.path)?.peerPath ?? payload.path
      if (!path) {
        blockers.push(`${node.label} : chemin PV non mappé`)
        continue
      }
      if (!node.sshReady) continue
      const manager = getSSHPool().get(node.sanId)!
      const pre = await runLvmPreflight(manager, {
        action: 'pvremove',
        payload: { path, confirmation: '' },
      }, node.overview)
      blockers.push(...pre.blockers.map(b => `${node.label}: ${b}`))
    }
  }

  if (req.action === 'vgremove' && primary) {
    const payload = req.payload as VgRemovePayload
    for (const node of nodes) {
      if (!node.sshReady) continue
      const manager = getSSHPool().get(node.sanId)!
      const pre = await runLvmPreflight(manager, {
        action: 'vgremove',
        payload: { name: payload.name, confirmation: '' },
      }, node.overview)
      blockers.push(...pre.blockers.map(b => `${node.label}: ${b}`))
    }
  }

  if (req.action === 'lvremove' && primary) {
    const payload = req.payload as LvRemovePayload
    for (const node of nodes) {
      if (!node.sshReady) continue
      const manager = getSSHPool().get(node.sanId)!
      const pre = await runLvmPreflight(manager, {
        action: 'lvremove',
        payload: { vgName: payload.vgName, name: payload.name, confirmation: '' },
      }, node.overview)
      blockers.push(...pre.blockers.map(b => `${node.label}: ${b}`))
    }
  }

  if (req.action === 'lvcreate' && primary) {
    const payload = req.payload as LvCreatePayload
    const sizeBytes = Number(payload.sizeBytes)
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      blockers.push('Taille LV invalide (doit être > 0)')
    }
    for (const node of nodes) {
      if (!node.sshReady) {
        blockers.push(`${node.label} : SSH non connecté`)
        continue
      }
      const vg = node.overview.vgs.find(v => v.name === payload.vgName && !v.clustered)
      if (!vg) {
        blockers.push(`${node.label} : VG ${payload.vgName} absent`)
      } else if (Number.isFinite(sizeBytes) && sizeBytes > vg.freeBytes) {
        blockers.push(`${node.label} : espace insuffisant dans ${payload.vgName}`)
      }
      if (node.overview.lvs.some(l => l.vgName === payload.vgName && l.name === payload.name)) {
        blockers.push(`${node.label} : LV ${payload.vgName}/${payload.name} existe déjà`)
      }
    }
    for (const node of nodes) {
      if (!node.sshReady) continue
      const manager = getSSHPool().get(node.sanId)!
      const pre = await runLvmPreflight(manager, {
        action: 'lvcreate',
        payload: { ...payload, confirmation: '' },
      }, node.overview)
      blockers.push(...pre.blockers.map(b => `${node.label}: ${b}`))
    }
  }

  const deduped = [...new Set(blockers)]
  return {
    ok: deduped.length === 0,
    blockers: deduped,
    warnings: [...new Set(warnings)],
    mappings: req.action === 'pvcreate' && primary && !req.clusterExecution?.diskMappings?.length
      ? buildClusterLvmDiskMappings(primarySanId, (req.payload as PvCreatePayload).path, nodes)
      : mappings,
    symmetryIssues,
    nodes,
  }
}
