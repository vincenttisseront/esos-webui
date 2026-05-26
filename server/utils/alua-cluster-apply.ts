import { createError } from 'h3'
import type { AluaClusterApplyResult, AluaClusterPlan } from '../../types/alua'
import { assertClusterNodesWritable } from './cluster-readonly'
import { resolveClusterMembers } from './cluster-resolve'
import { getSSHPool } from './ssh-pool'
import { withSanContext } from './ssh-runtime'
import { writeAndReloadScst } from './scst-config-writer'

export const ALUA_CONFIRMATION_PHRASE = 'CONFIGURE ALUA'

export async function applyAluaClusterPlan(
  plan: AluaClusterPlan,
  confirmation: string,
): Promise<AluaClusterApplyResult> {
  if (confirmation.trim() !== ALUA_CONFIRMATION_PHRASE) {
    throw createError({ statusCode: 400, statusMessage: 'Phrase de confirmation incorrecte' })
  }

  const members = resolveClusterMembers({ clusterId: plan.clusterId })
  if (members.length !== 2) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Application ALUA limitée aux clusters à deux nœuds',
    })
  }

  assertClusterNodesWritable(plan.clusterId)

  const pool = getSSHPool()
  const nodeResults: AluaClusterApplyResult['nodeResults'] = []
  const errors: string[] = []

  // Apply peer first, then primary (reduce failover window)
  const order = [plan.peerNodeId, plan.primaryNodeId]
  for (const nodeId of order) {
    const nodePlan = plan.nodes.find(n => n.nodeId === nodeId)
    const member = members.find(m => m.id === nodeId)
    if (!nodePlan || !member) continue

    const mgr = pool.get(nodeId)
    if (!mgr || mgr.getStatus() !== 'connected') {
      const err = `${member.label}: SSH non disponible`
      errors.push(err)
      nodeResults.push({ nodeId, hostname: nodePlan.hostname, ok: false, error: err })
      break
    }

    try {
      await withSanContext(nodeId, async () => {
        await writeAndReloadScst(nodePlan.scstConfAfter, mgr)
      })
      nodeResults.push({ nodeId, hostname: nodePlan.hostname, ok: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur application SCST'
      errors.push(`${member.label}: ${msg}`)
      nodeResults.push({ nodeId, hostname: nodePlan.hostname, ok: false, error: msg })
      break
    }
  }

  return {
    ok:          errors.length === 0 && nodeResults.every(r => r.ok),
    nodeResults,
    errors,
  }
}
