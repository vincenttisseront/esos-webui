import { createError } from 'h3'
import { getSSHPool } from './ssh-pool'
import { runLvmPreflight } from './lvm-preflight'
import { withSanContext } from './ssh-runtime'
import { validateScstDeviceName } from '~/utils/lvm-scst-device-ui'
import type { BindScstPayload, ClusterLvmNodeInventory, ClusterLvmPreflightPerNode } from './lvm-types'

export function validateBindScstClusterPayload(
  payload: Partial<BindScstPayload>,
): { ok: true; payload: BindScstPayload } | { ok: false; message: string } {
  const vgName = String(payload.vgName ?? '').trim()
  const lvName = String(payload.lvName ?? '').trim()
  const deviceName = String(payload.deviceName ?? '').trim()
  if (!vgName || !lvName) {
    return { ok: false, message: 'vgName et lvName requis pour bind_scst' }
  }
  const nameErr = validateScstDeviceName(deviceName)
  if (nameErr === 'empty') return { ok: false, message: 'Nom de device SCST requis' }
  if (nameErr === 'invalid') return { ok: false, message: 'Nom de device SCST invalide' }
  if (nameErr === 'too_long') return { ok: false, message: 'Nom de device SCST : maximum 32 caractères' }
  return {
    ok: true,
    payload: { vgName, lvName, deviceName, confirmation: String(payload.confirmation ?? '') },
  }
}

export async function preflightBindScstOnClusterNodes(
  nodes: ClusterLvmNodeInventory[],
  payload: BindScstPayload,
): Promise<{ blockers: string[]; warnings: string[]; perNode: ClusterLvmPreflightPerNode[] }> {
  const blockers: string[] = []
  const warnings: string[] = []
  const perNode: ClusterLvmPreflightPerNode[] = []

  for (const node of nodes) {
    const entry: ClusterLvmPreflightPerNode = {
      sanId: node.sanId,
      label: node.label,
      ok: true,
      blockers: [],
      warnings: [],
    }

    if (!node.sshReady) {
      const msg = `${node.label} : SSH non disponible`
      entry.ok = false
      entry.blockers.push(msg)
      blockers.push(msg)
      perNode.push(entry)
      continue
    }

    if (node.readOnly) {
      const msg = `${node.label} : lecture seule`
      entry.ok = false
      entry.blockers.push(msg)
      blockers.push(msg)
      perNode.push(entry)
      continue
    }

    const manager = getSSHPool().get(node.sanId)
    if (!manager || manager.getStatus() !== 'connected') {
      const msg = `${node.label} : connexion SSH indisponible`
      entry.ok = false
      entry.blockers.push(msg)
      blockers.push(msg)
      perNode.push(entry)
      continue
    }

    try {
      const pre = await withSanContext(node.sanId, () =>
        runLvmPreflight(manager, {
          action: 'bind_scst',
          payload: { ...payload, confirmation: '' },
        }, node.overview),
      )
      entry.blockers.push(...pre.blockers)
      entry.warnings.push(...pre.warnings)
      entry.ok = pre.ok
      blockers.push(...pre.blockers)
      warnings.push(...pre.warnings)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur préflight SCST'
      const line = `${node.label} : ${msg}`
      entry.ok = false
      entry.error = msg
      entry.blockers.push(line)
      blockers.push(line)
    }

    perNode.push(entry)
  }

  return {
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    perNode,
  }
}

export function bindScstPreflightHasConflictOnly(blockers: string[]): boolean {
  if (!blockers.length) return false
  return blockers.every(b =>
    b.startsWith('BIND_SCST:device_exists:')
    || b.startsWith('BIND_SCST:lv_path_in_use:')
    || /existe déjà/i.test(b),
  )
}

export function assertClusterBindScstPreflightRequest(
  clusterId: string,
  primarySanId: string,
  action: string,
  payload: unknown,
): BindScstPayload {
  if (action !== 'bind_scst') {
    throw createError({ statusCode: 400, message: `Action ${action} non gérée par ce préflight SCST` })
  }
  if (!clusterId || !primarySanId) {
    throw createError({ statusCode: 400, message: 'clusterId et primarySanId requis' })
  }
  const validated = validateBindScstClusterPayload(payload as Partial<BindScstPayload>)
  if (!validated.ok) {
    throw createError({ statusCode: 400, message: validated.message })
  }
  return validated.payload
}
