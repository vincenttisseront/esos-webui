import { eq } from 'drizzle-orm'
import { getDB } from '../db'
import { clusters } from '../db/schema'
import { resolveClusterMembers } from './cluster-resolve'
import {
  collectPreflightNodes,
  runAluaWizardPreflight,
} from './alua-wizard-preflight'
import { defaultAssignmentsForTwoNodes } from './alua-wizard-plan'
import { listScstDeviceNames, listScstTargetNames } from './alua-scst-config'
import type { AluaWizardInventory, AluaWizardInventoryNode } from '../../types/alua'

export async function buildAluaWizardInventory(clusterId: string): Promise<AluaWizardInventory> {
  const db = getDB()
  const cluster = db.select().from(clusters).where(eq(clusters.id, clusterId)).get()
  const members = resolveClusterMembers({ clusterId })
  const nodes = await collectPreflightNodes(members)
  const preflight = runAluaWizardPreflight(members, nodes)

  const inventoryNodes: AluaWizardInventoryNode[] = nodes.map((n) => {
    const devices = listScstDeviceNames(n.config)
    const targets = listScstTargetNames(n.config)
    return {
      nodeId:               n.nodeId,
      hostname:             n.hostname,
      host:                 members.find(m => m.id === n.nodeId)?.host ?? '',
      sshReady:             n.sshReady,
      readOnly:             n.readOnly,
      devices,
      targets,
      existingDeviceGroups: n.sysfsDeviceGroups,
      suggestedAssignments: [],
    }
  })

  if (inventoryNodes.length === 2 && inventoryNodes.every(n => n.sshReady)) {
    const [a, b] = inventoryNodes
    const suggested = defaultAssignmentsForTwoNodes(
      a!.nodeId, b!.nodeId, a!.targets, b!.targets,
    )
    for (const node of inventoryNodes) {
      node.suggestedAssignments = suggested
    }
  }

  return {
    clusterId,
    clusterName: cluster?.name,
    nodeCount:   members.length,
    canExecute:  preflight.canExecute,
    nodes:       inventoryNodes,
  }
}
