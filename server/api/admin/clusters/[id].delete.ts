import { eq } from 'drizzle-orm'
import { getDB } from '../../../db'
import { clusters, sans } from '../../../db/schema'
import { getSSHPool } from '../../../utils/ssh-pool'

/**
 * DELETE /api/admin/clusters/:id
 * Admin only — arrête et désactive corosync/pacemaker sur chaque nœud,
 * puis réinitialise la configuration cluster en DB.
 */
export default defineEventHandler(async (event) => {
  // Vérification du rôle admin
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Action réservée aux administrateurs.' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'id manquant' })

  const db   = getDB()
  const pool = getSSHPool()

  // Récupère les nœuds du cluster
  const nodes = db.select().from(sans).where(eq(sans.clusterId, id)).all()

  // Arrête et désactive les services sur chaque nœud (best-effort, non bloquant)
  const serviceErrors: string[] = []
  for (const node of nodes) {
    const mgr = pool.get(node.id)
    if (!mgr || mgr.getStatus() !== 'connected') {
      serviceErrors.push(`${node.label} : SSH non disponible`)
      continue
    }
    try {
      // Stop pacemaker first, then corosync
      await mgr.exec('/etc/rc.d/rc.pacemaker stop 2>&1; true')
      await mgr.exec('/etc/rc.d/rc.corosync stop 2>&1; true')
      // Disable both in rc.conf
      await mgr.exec(`sed -i 's/rc\\.pacemaker_enable="YES"/rc.pacemaker_enable="NO"/' /etc/rc.conf; true`)
      await mgr.exec(`sed -i 's/rc\\.corosync_enable="YES"/rc.corosync_enable="NO"/' /etc/rc.conf; true`)
    } catch (err: any) {
      serviceErrors.push(`${node.label} : ${err?.message ?? 'erreur inconnue'}`)
    }
  }

  // Réinitialise tous les SANs du cluster
  const now = new Date().toISOString()
  db.update(sans)
    .set({ clusterEnabled: false, clusterRole: null, clusterPeer: null, clusterId: null, updatedAt: now })
    .where(eq(sans.clusterId, id))
    .run()

  // Supprime le cluster
  db.delete(clusters).where(eq(clusters.id, id)).run()

  return {
    ok: true,
    warnings: serviceErrors.length > 0 ? serviceErrors : undefined,
  }
})
