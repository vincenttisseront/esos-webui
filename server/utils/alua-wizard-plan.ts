import { createError } from 'h3'
import type {
  AluaClusterPlan,
  AluaNodePlan,
  AluaWizardAssignment,
  AluaWizardRequest,
} from '../../types/alua'
import type { AluaDeviceGroupConfig, AluaTargetGroupConfig, ScstConfig } from '~/types/esos'
import { buildAluaNodeSnapshot, compareAluaCluster } from './alua-cluster-compare'
import { issuePlanToken } from './alua-plan-token'
import {
  deviceGroupConfigToSnapshot,
  serializeConfig,
  targetExistsOnConfig,
  upsertDeviceGroup,
} from './alua-scst-config'
import { diffLines } from '../../utils/diff-lines'

export interface NodePlanInput {
  nodeId:   string
  hostname: string
  config:   ScstConfig
}

export function resolvePrimaryAndPeer(
  nodes: NodePlanInput[],
  primaryNodeId?: string,
): { primary: NodePlanInput; peer: NodePlanInput } {
  if (nodes.length !== 2) {
    throw createError({ statusCode: 400, statusMessage: 'Exactement deux nœuds requis pour le plan ALUA' })
  }
  let primary = primaryNodeId
    ? nodes.find(n => n.nodeId === primaryNodeId)
    : nodes[0]
  if (!primary) {
    throw createError({ statusCode: 400, statusMessage: 'primaryNodeId invalide' })
  }
  const peer = nodes.find(n => n.nodeId !== primary!.nodeId)
  if (!peer) {
    throw createError({ statusCode: 400, statusMessage: 'Nœud pair introuvable' })
  }
  return { primary, peer }
}

export function buildDeviceGroupForNode(
  req: AluaWizardRequest,
  nodeId: string,
  peerId: string,
  isPrimary: boolean,
): AluaDeviceGroupConfig {
  const { local: localName, remote: remoteName } = req.targetGroupNames
  const localTargets = req.assignments
    .filter(a => a.nodeId === nodeId && a.role === 'local')
    .map(a => a.targetName)
  const remoteTargets = req.assignments
    .filter(a => a.nodeId === peerId && a.role === 'local')
    .map(a => a.targetName)

  const uniq = (arr: string[]) => [...new Set(arr)].sort()

  let localId = req.groupIdsOnPrimary.local
  let remoteId = req.groupIdsOnPrimary.remote
  if (!isPrimary) {
    localId = req.groupIdsOnPrimary.remote
    remoteId = req.groupIdsOnPrimary.local
  }

  const targetGroups: AluaTargetGroupConfig[] = [
    { name: localName, groupId: localId, targets: uniq(localTargets) },
    { name: remoteName, groupId: remoteId, targets: uniq(remoteTargets) },
  ]

  return {
    name:         req.deviceGroupName,
    devices:      [...req.deviceNames].sort(),
    targetGroups,
  }
}

export function buildNodePlan(
  input: NodePlanInput,
  req: AluaWizardRequest,
  peerId: string,
  isPrimary: boolean,
): AluaNodePlan {
  const dg = buildDeviceGroupForNode(req, input.nodeId, peerId, isPrimary)
  const before = serializeConfig(input.config)
  const config = structuredClone(input.config)
  if (!config.deviceGroups) config.deviceGroups = []

  for (const tg of dg.targetGroups) {
    for (const t of tg.targets) {
      if (!targetExistsOnConfig(config, t)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Cible ${t} absente de scst.conf sur ${input.hostname}`,
        })
      }
    }
  }

  upsertDeviceGroup(config, dg, req.mode)
  const after = serializeConfig(config)
  const patchSummary = diffLines(before, after).filter(l => l.startsWith('+') || l.startsWith('-'))

  return {
    nodeId:             input.nodeId,
    hostname:           input.hostname,
    deviceGroup:        dg,
    scstConfBefore:     before,
    scstConfAfter:      after,
    configPatchSummary: patchSummary.slice(0, 80),
    warnings:           [],
  }
}

export function buildAluaClusterPlan(
  req: AluaWizardRequest,
  nodes: NodePlanInput[],
): AluaClusterPlan {
  const { primary, peer } = resolvePrimaryAndPeer(nodes, req.primaryNodeId)
  const primaryPlan = buildNodePlan(primary, req, peer.nodeId, true)
  const peerPlan = buildNodePlan(peer, req, primary.nodeId, false)

  const snapshots = [primaryPlan, peerPlan].map(p =>
    buildAluaNodeSnapshot(p.nodeId, p.hostname, '', true, [deviceGroupConfigToSnapshot(p.deviceGroup)]),
  )

  const comparisonPreview = compareAluaCluster(snapshots, { expectLocalRemotePair: true })

  const plan: AluaClusterPlan = {
    clusterId:         req.clusterId,
    primaryNodeId:     primary.nodeId,
    peerNodeId:        peer.nodeId,
    nodes:             [primaryPlan, peerPlan],
    comparisonPreview,
    planToken:         '',
  }
  plan.planToken = issuePlanToken(plan)
  return plan
}

export function defaultAssignmentsForTwoNodes(
  primaryId: string,
  peerId: string,
  primaryTargets: string[],
  peerTargets: string[],
): AluaWizardAssignment[] {
  const out: AluaWizardAssignment[] = []
  for (const t of primaryTargets) out.push({ nodeId: primaryId, targetName: t, role: 'local' })
  for (const t of peerTargets) out.push({ nodeId: peerId, targetName: t, role: 'local' })
  return out
}
