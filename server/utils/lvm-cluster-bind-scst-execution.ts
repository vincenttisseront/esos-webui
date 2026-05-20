import { createError } from 'h3'
import { buildLvPathCandidates } from '~/utils/lvm-lv-path'
import { buildScstRegisterPreview } from '~/utils/lvm-scst-device-ui'
import { getSSHPool } from './ssh-pool'
import { invalidateStorageCaches } from './lvm-api-helpers'
import { resolveBlockDevicePathFromCandidates } from './lvm-lv-device-path'
import { createDevice } from './scst-config-writer'
import { withSanContext } from './ssh-runtime'
import type {
  BindScstPayload,
  ClusterLvmNodeInventory,
  ClusterLvmNodeResult,
} from './lvm-types'

export type BindScstClusterResult = {
  success: boolean
  deviceName: string
  nodeResults: ClusterLvmNodeResult[]
  errors: string[]
  refreshedSanIds: string[]
}

function logBindScst(nodeLabel: string, command: string, ok: boolean, detail?: string) {
  const prefix = `[lvm/bind_scst] node=${nodeLabel} command=${command}`
  if (ok) console.log(`${prefix} ok`)
  else console.error(`${prefix} error=${detail ?? 'unknown'}`)
}

export async function executeBindScstOnClusterNodes(
  nodes: ClusterLvmNodeInventory[],
  payload: BindScstPayload,
): Promise<BindScstClusterResult> {
  const nodeResults: ClusterLvmNodeResult[] = []
  const errors: string[] = []
  const refreshedSanIds = new Set<string>()
  const { vgName, lvName, deviceName } = payload

  for (const node of nodes) {
    const base: ClusterLvmNodeResult = {
      sanId: node.sanId,
      label: node.label,
      participation: 'failed',
    }

    if (!node.sshReady) {
      const msg = 'SSH non disponible'
      logBindScst(node.label, '-', false, msg)
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({ ...base, error: msg })
      continue
    }

    if (node.readOnly) {
      const msg = 'lecture seule'
      logBindScst(node.label, '-', false, msg)
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({ ...base, error: msg })
      continue
    }

    const manager = getSSHPool().get(node.sanId)
    if (!manager || manager.getStatus() !== 'connected') {
      const msg = 'connexion SSH indisponible'
      logBindScst(node.label, '-', false, msg)
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({ ...base, error: msg })
      continue
    }

    const lvRow = node.overview.lvs.find(l => l.vgName === vgName && l.name === lvName)
    if (!lvRow) {
      const msg = `LV ${vgName}/${lvName} introuvable`
      logBindScst(node.label, '-', false, msg)
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({ ...base, error: msg })
      continue
    }

    const candidates = lvRow.pathCandidates?.length
      ? lvRow.pathCandidates
      : buildLvPathCandidates(vgName, lvName, { lvPath: lvRow.path })

    try {
      await withSanContext(node.sanId, async () => {
        const resolved = await resolveBlockDevicePathFromCandidates(manager, candidates)
        const backingPath = resolved.path
        if (!backingPath) {
          throw new Error(`Chemin bloc introuvable (testé : ${candidates.join(', ')})`)
        }
        const command = buildScstRegisterPreview(deviceName, backingPath)
        await createDevice('vdisk_blockio', deviceName, backingPath)
        logBindScst(node.label, command, true)
        nodeResults.push({
          sanId: node.sanId,
          label: node.label,
          participation: 'execute',
          command,
          exitCode: 0,
        })
        refreshedSanIds.add(node.sanId)
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur création SCST'
      const command = buildScstRegisterPreview(deviceName, lvRow.path)
      logBindScst(node.label, command, false, msg)
      errors.push(`${node.label}: ${msg}`)
      nodeResults.push({
        ...base,
        command,
        error: msg,
        stderr: msg,
      })
    }
  }

  for (const id of refreshedSanIds) invalidateStorageCaches(id)

  const executeCount = nodeResults.filter(n => n.participation === 'execute').length
  return {
    success: executeCount > 0 && errors.length === 0
      && nodeResults.every(n => n.participation === 'execute'),
    deviceName,
    nodeResults,
    errors,
    refreshedSanIds: [...refreshedSanIds],
  }
}

export function assertBindScstClusterSuccess(result: BindScstClusterResult): void {
  if (result.success) return
  throw createError({
    statusCode: 422,
    message: result.errors.join(' · ') || 'Création SCST cluster échouée',
    data: { nodeResults: result.nodeResults },
  })
}
