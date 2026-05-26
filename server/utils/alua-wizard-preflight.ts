import type {
  AluaWizardBlocker,
  AluaWizardPreflightResult,
  AluaWizardRequest,
} from '../../types/alua'
import { compareAluaCluster } from './alua-cluster-compare'
import { findTargetInOtherDeviceGroups } from './alua-scst-config'
import type { NodePlanInput } from './alua-wizard-plan'
import { buildAluaClusterPlan } from './alua-wizard-plan'
import type { ClusterSanMember } from './cluster-resolve'
import { isSystemDriver } from '~/types/esos'
import { getSSHPool } from './ssh-pool'
import { readClusterNodeStatus } from './cluster-reader'
import type { ClusterNodeRole } from './types'

const DEVICE_GROUP_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/

function blocker(code: string, messageKey: string, params?: Record<string, string | number>): AluaWizardBlocker {
  return { code, messageKey, messageParams: params }
}

export interface PreflightNodeContext extends NodePlanInput {
  readOnly: boolean
  sshReady: boolean
  sysfsDeviceGroups: import('../../types/alua').AluaDeviceGroup[]
}

export function runAluaWizardPreflight(
  members: ClusterSanMember[],
  nodes: PreflightNodeContext[],
  req?: Partial<AluaWizardRequest>,
): AluaWizardPreflightResult {
  const blockers: AluaWizardBlocker[] = []
  const warnings: AluaWizardBlocker[] = []
  const nodeCount = members.length

  if (nodeCount < 2) {
    blockers.push(blocker('min_nodes', 'cluster.alua.wizard.blockers.min_nodes'))
  }
  const canExecute = nodeCount === 2

  if (nodeCount >= 2 && nodeCount !== 2) {
    warnings.push(blocker('two_node_only', 'cluster.alua.wizard.blockers.two_node_only'))
  }

  for (const n of nodes) {
    if (!n.sshReady) {
      blockers.push(blocker('ssh_down', 'cluster.alua.wizard.blockers.ssh_down', { hostname: n.hostname }))
    }
    if (n.readOnly) {
      blockers.push(blocker('read_only', 'cluster.alua.wizard.blockers.read_only', { hostname: n.hostname }))
    }
    if (n.sshReady && listScstDevices(n).length === 0) {
      blockers.push(blocker('missing_devices', 'cluster.alua.wizard.blockers.missing_devices', { hostname: n.hostname }))
    }
    if (n.sshReady && listScstTargets(n).length === 0) {
      blockers.push(blocker('missing_targets', 'cluster.alua.wizard.blockers.missing_targets', { hostname: n.hostname }))
    }
  }

  if (req?.deviceGroupName !== undefined) {
    const name = req.deviceGroupName.trim()
    if (!name || !DEVICE_GROUP_RE.test(name)) {
      blockers.push(blocker('invalid_device_group', 'cluster.alua.wizard.blockers.invalid_device_group'))
    }
  }

  if (req?.groupIdsOnPrimary) {
    const { local, remote } = req.groupIdsOnPrimary
    if (local === remote) {
      blockers.push(blocker('duplicate_group_id', 'cluster.alua.wizard.blockers.duplicate_group_id'))
    }
  }

  if (req?.deviceNames?.length && nodes.length >= 2) {
    for (const n of nodes) {
      if (!n.sshReady) continue
      const devs = new Set(listScstDevices(n))
      for (const d of req.deviceNames) {
        if (!devs.has(d)) {
          blockers.push(blocker('device_not_on_all_nodes', 'cluster.alua.wizard.blockers.device_not_on_all_nodes', {
            device: d,
            hostname: n.hostname,
          }))
        }
      }
    }
  }

  if (req?.assignments?.length) {
    for (const a of req.assignments) {
      const node = nodes.find(n => n.nodeId === a.nodeId)
      if (!node?.sshReady) continue
      if (!listScstTargets(node).includes(a.targetName)) {
        blockers.push(blocker('invalid_target_reference', 'cluster.alua.wizard.blockers.invalid_target_reference', {
          targetName: a.targetName,
          hostname: node.hostname,
        }))
      }
      const otherDg = findTargetInOtherDeviceGroups(
        node.config,
        a.targetName,
        req.mode === 'replace' ? req.deviceGroupName : undefined,
      )
      if (otherDg) {
        blockers.push(blocker('target_already_in_alua', 'cluster.alua.wizard.blockers.target_already_in_alua', {
          targetName: a.targetName,
          deviceGroup: otherDg,
        }))
      }
    }
  }

  if (req?.deviceGroupName && req.mode !== 'replace') {
    for (const n of nodes) {
      const existsConf = n.config.deviceGroups?.some(dg => dg.name === req.deviceGroupName)
      const existsSysfs = n.sysfsDeviceGroups.some(dg => dg.name === req.deviceGroupName)
      if (existsConf || existsSysfs) {
        blockers.push(blocker('conflicting_alua', 'cluster.alua.wizard.blockers.conflicting_alua', {
          deviceGroup: req.deviceGroupName,
          hostname: n.hostname,
        }))
      }
    }
  }

  if (nodes.filter(n => n.sshReady).length >= 2) {
    const readySnapshots = nodes
      .filter(n => n.sshReady)
      .map(n => ({
        nodeId:       n.nodeId,
        hostname:     n.hostname,
        host:         '',
        sshReady:     true,
        deviceGroups: n.sysfsDeviceGroups,
        aluaPresent:  n.sysfsDeviceGroups.length > 0,
      }))
    const cmp = compareAluaCluster(readySnapshots, { expectLocalRemotePair: nodeCount === 2 })
    if (cmp.health !== 'ok' && cmp.health !== 'missing' && req?.mode !== 'replace') {
      warnings.push(blocker('conflicting_alua', 'cluster.alua.wizard.warnings.existing_asymmetric'))
    }
  }

  if (req?.clusterId && req.deviceGroupName && req.deviceNames?.length && req.assignments?.length && canExecute) {
    try {
      buildAluaClusterPlan(req as AluaWizardRequest, nodes)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'statusMessage' in err
        ? String((err as { statusMessage: unknown }).statusMessage)
        : err instanceof Error ? err.message : 'Plan invalide'
      blockers.push(blocker('plan_invalid', 'cluster.alua.wizard.blockers.plan_invalid', { detail: msg }))
    }
  }

  const ok = blockers.length === 0
  return { ok, blockers, warnings, nodeCount, canExecute: ok && canExecute }
}

function listScstDevices(n: PreflightNodeContext): string[] {
  const names: string[] = []
  for (const h of n.config.handlers) {
    for (const d of h.devices) names.push(d.name)
  }
  return names
}

function listScstTargets(n: PreflightNodeContext): string[] {
  const names: string[] = []
  for (const d of n.config.drivers) {
    if (isSystemDriver(d.name)) continue
    for (const t of d.targets) names.push(t.name)
  }
  return names
}

export async function collectPreflightNodes(
  members: ClusterSanMember[],
): Promise<PreflightNodeContext[]> {
  const pool = getSSHPool()
  return Promise.all(
    members.map(async (m) => {
      const mgr = pool.get(m.id)
      const sshReady = Boolean(mgr && mgr.getStatus() === 'connected')
      let config: import('~/types/esos').ScstConfig = { handlers: [], drivers: [], deviceGroups: [] }
      if (sshReady && mgr) {
        const { readScstConfig } = await import('./scst-config-reader')
        config = await readScstConfig(mgr)
      }
      const status = await readClusterNodeStatus(
        m.id,
        m.host,
        (m.clusterRole ?? 'secondary') as ClusterNodeRole,
      )
      return {
        nodeId:            m.id,
        hostname:          m.label || status.hostname,
        config,
        readOnly:          m.readOnly,
        sshReady,
        sysfsDeviceGroups: status.aluaDeviceGroups ?? [],
      }
    }),
  )
}
