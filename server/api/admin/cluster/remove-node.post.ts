import { eq } from 'drizzle-orm'
import { getDB } from '../../../db'
import { sans, clusters } from '../../../db/schema'
import { readClusterNodeStatus } from '../../../utils/cluster-reader'
import { getSSHPool } from '../../../utils/ssh-pool'
import type { ClusterNodeRole } from '../../../utils/types'
import { syncClusterNodesFromSans } from '../../../db/repositories/cluster.repository'

/**
 * POST /api/admin/cluster/remove-node
 * Retire un nœud d'un cluster Pacemaker/Corosync :
 *   1. Stop pacemaker + corosync sur le nœud retiré (best-effort)
 *   2. crm node standby + delete sur le nœud primaire (best-effort)
 *   3. Reset de l'entrée SAN en DB
 * Admin only.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden', data: { code: 'rbac.forbidden' } })
  }

  const body = await readBody<{ nodeId: string; primaryNodeId?: string; clusterId?: string; skipDb?: boolean }>(event)
  if (!body.nodeId) throw createError({ statusCode: 400, message: 'nodeId requis' })

  const db   = getDB()
  const pool = getSSHPool()

  // Récupère le label du nœud pour crm node delete
  const node = db.select().from(sans).where(eq(sans.id, body.nodeId)).get()
  if (!node) throw createError({ statusCode: 404, message: 'Nœud introuvable' })
  if (body.clusterId && node.clusterId !== body.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'Le nœud n\'appartient pas à ce cluster' })
  }

  const warnings: string[] = []

  // ── 1. Stop services sur le nœud retiré ───────────────────────────────────
  const removedMgr = pool.get(body.nodeId)
  if (removedMgr && removedMgr.getStatus() === 'connected') {
    try {
      await removedMgr.exec('/etc/rc.d/rc.pacemaker stop 2>&1; true', 30_000)
      await removedMgr.exec('/etc/rc.d/rc.corosync stop 2>&1; true', 30_000)
      await removedMgr.exec(`sed -i 's/rc\\.pacemaker_enable="YES"/rc.pacemaker_enable="NO"/' /etc/rc.conf; true`)
      await removedMgr.exec(`sed -i 's/rc\\.corosync_enable="YES"/rc.corosync_enable="NO"/' /etc/rc.conf; true`)
    } catch (err: any) {
      warnings.push(`Stop services sur ${node.label} : ${err?.message ?? 'erreur'}`)
    }
  } else {
    warnings.push(`${node.label} : SSH non disponible, services non arrêtés`)
  }

  // ── 2. crm node standby + delete sur le nœud primaire ────────────────────
  if (body.primaryNodeId && body.primaryNodeId !== body.nodeId) {
    const primaryMgr = pool.get(body.primaryNodeId)
    if (primaryMgr && primaryMgr.getStatus() === 'connected') {
      try {
        let crmNodeName = node.label
        try {
          const status = await readClusterNodeStatus(
            body.nodeId,
            node.host,
            (node.clusterRole ?? 'secondary') as ClusterNodeRole,
          )
          if (status.hostname && status.hostname !== 'localhost' && status.hostname !== '127.0.0.1') {
            crmNodeName = status.hostname
          }
        } catch {
          // fallback label
        }
        await primaryMgr.exec(`crm node standby "${crmNodeName}" 2>&1; true`, 15_000)
        await primaryMgr.exec(`crm node delete "${crmNodeName}" 2>&1; true`, 15_000)
      } catch (err: any) {
        warnings.push(`crm node delete sur primaire : ${err?.message ?? 'erreur'}`)
      }
    } else {
      warnings.push('Nœud primaire SSH non disponible, crm node delete non exécuté')
    }
  }

  // ── 3. Reset en DB (sauf si déjà fait par l'appelant) ───────────────────
  const clusterIdRef = node.clusterId
  const now = new Date().toISOString()

  if (!body.skipDb) {
    db.update(sans)
      .set({ clusterEnabled: false, clusterRole: null, clusterPeer: null, clusterId: null, updatedAt: now })
      .where(eq(sans.id, body.nodeId))
      .run()

    // ── 4. Auto-dissolution si le cluster a < 2 nœuds restants ──────────
    if (clusterIdRef) {
      const remaining = db.select().from(sans).where(eq(sans.clusterId, clusterIdRef)).all()
      if (remaining.length < 2) {
        if (remaining.length > 0) {
          db.update(sans)
            .set({ clusterEnabled: false, clusterRole: null, clusterPeer: null, clusterId: null, updatedAt: now })
            .where(eq(sans.clusterId, clusterIdRef))
            .run()
          warnings.push(`Cluster dissous — ${remaining.map(n => n.label).join(', ')} redevient standalone.`)
        }
        db.delete(clusters).where(eq(clusters.id, clusterIdRef)).run()
      } else {
        syncClusterNodesFromSans(clusterIdRef)
      }
    }
  }

  return { ok: true, nodeId: body.nodeId, warnings: warnings.length ? warnings : undefined }
})