import { getSSHPool } from '../../utils/ssh-pool'
import { getAllSans } from '../../db/repositories/san.repository'

interface ServiceBody {
  nodeId:  string
  service: 'corosync' | 'pacemaker' | 'scst' | 'drbd'
  action:  'start' | 'stop' | 'enable' | 'disable'
}

const RC_SCRIPTS: Record<string, string> = {
  corosync:  '/etc/rc.d/rc.corosync',
  pacemaker: '/etc/rc.d/rc.pacemaker',
  scst:      '/etc/rc.d/rc.scst',
  drbd:      '/etc/rc.d/rc.drbd',
}

const RC_CONF_KEYS: Record<string, string> = {
  corosync:  'rc\\.corosync_enable',
  pacemaker: 'rc\\.pacemaker_enable',
  scst:      'rc\\.scst_enable',
  drbd:      'rc\\.drbd_enable',
}

const RC_CONF_NAMES: Record<string, string> = {
  corosync:  'rc.corosync_enable',
  pacemaker: 'rc.pacemaker_enable',
  scst:      'rc.scst_enable',
  drbd:      'rc.drbd_enable',
}

/**
 * POST /api/cluster/service — Démarrer/arrêter/activer/désactiver un service cluster.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<ServiceBody>(event)

  if (!body.nodeId || !body.service || !body.action) {
    throw createError({ statusCode: 400, message: 'nodeId, service et action sont requis' })
  }

  // Bloquer les mutations si le SAN est en lecture seule
  const san = getAllSans().find(s => s.id === body.nodeId)
  if (san?.readOnly) {
    throw createError({ statusCode: 403, message: 'Ce SAN est en lecture seule. Désactivez la protection dans Administration → SANs pour autoriser les modifications.' })
  }

  const pool = getSSHPool()
  const mgr  = pool.get(body.nodeId)

  if (!mgr || mgr.getStatus() !== 'connected') {
    throw createError({ statusCode: 503, message: 'SSH non disponible sur ce nœud' })
  }

  const rcKey  = RC_CONF_KEYS[body.service]
  const rcName = RC_CONF_NAMES[body.service]
  const script = RC_SCRIPTS[body.service]

  if (!rcKey || !rcName || !script) {
    throw createError({ statusCode: 400, message: 'Service inconnu' })
  }

  let cmd: string
  switch (body.action) {
    case 'start':
      cmd = `${script} start 2>&1`
      break
    case 'stop':
      cmd = `${script} stop 2>&1`
      break
    case 'enable':
      // Supprime la ligne existante puis ajoute la valeur — fonctionne même si la clé est absente
      cmd = `sed -i '/^${rcKey}=/d' /etc/rc.conf && echo '${rcName}="YES"' >> /etc/rc.conf`
      break
    case 'disable':
      cmd = `sed -i '/^${rcKey}=/d' /etc/rc.conf && echo '${rcName}="NO"' >> /etc/rc.conf`
      break
    default:
      throw createError({ statusCode: 400, message: 'Action inconnue' })
  }

  const result = await mgr.exec(cmd, 30_000)
  return { ok: true, output: result.stdout }
})
