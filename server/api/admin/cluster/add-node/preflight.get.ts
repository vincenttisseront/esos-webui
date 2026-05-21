import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { getDB } from '../../../../db'
import { clusters, sans } from '../../../../db/schema'
import { resolveClusterMembers } from '../../../../utils/cluster-resolve'
import { readClusterMemberVersions } from '../../../../utils/cluster-version'
import { getSSHPool } from '../../../../utils/ssh-pool'

/**
 * GET /api/admin/cluster/add-node/preflight?clusterId=&sanId=
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user || user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden', data: { code: 'rbac.forbidden' } })
  }

  const query = getQuery(event)
  const clusterId = typeof query.clusterId === 'string' ? query.clusterId.trim() : ''
  const sanId = typeof query.sanId === 'string' ? query.sanId.trim() : ''
  if (!clusterId || !sanId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId et sanId requis' })
  }

  const db = getDB()
  if (!db.select().from(clusters).where(eq(clusters.id, clusterId)).get()) {
    throw createError({ statusCode: 404, statusMessage: 'Cluster introuvable' })
  }

  const candidate = db.select().from(sans).where(eq(sans.id, sanId)).get()
  if (!candidate) {
    throw createError({ statusCode: 404, statusMessage: 'SAN introuvable' })
  }
  if (candidate.clusterId) {
    throw createError({ statusCode: 409, statusMessage: 'Ce SAN appartient déjà à un cluster' })
  }

  const members = resolveClusterMembers({ clusterId })
  const checks: Array<{ label: string; ok: boolean; detail: string }> = []
  const blockers: string[] = []
  const warnings: string[] = []

  const pool = getSSHPool()
  const mgr = pool.get(sanId)
  const sshOk = Boolean(mgr && mgr.getStatus() === 'connected')
  checks.push({
    label: 'SSH',
    ok: sshOk,
    detail: sshOk ? 'Connecté' : 'SSH non disponible',
  })
  if (!sshOk) blockers.push('Le SAN candidat doit être joignable en SSH.')

  if (candidate.readOnly) {
    checks.push({ label: 'Mode édition', ok: false, detail: 'Lecture seule' })
    blockers.push('Désactivez la lecture seule sur le SAN candidat.')
  }

  const versions = await readClusterMemberVersions([...members, {
    id: candidate.id,
    label: candidate.label,
    host: candidate.host,
    port: candidate.port,
    status: candidate.status,
    readOnly: candidate.readOnly,
    clusterEnabled: false,
    clusterRole: null,
    clusterId: null,
    clusterPeer: null,
  }])

  const memberVersions = versions.filter(v => members.some(m => m.id === v.sanId) && v.normalized)
  const candidateVersion = versions.find(v => v.sanId === sanId)?.normalized ?? ''
  if (memberVersions.length && candidateVersion) {
    const ref = memberVersions[0]!.normalized
    const match = ref === candidateVersion
    checks.push({
      label: 'Version ESOS',
      ok: match,
      detail: match ? ref : `${ref} (cluster) vs ${candidateVersion} (candidat)`,
    })
    if (!match) blockers.push('Versions ESOS différentes — alignez les builds avant l\'ajout.')
  }

  const ok = blockers.length === 0
  return { ok, clusterId, sanId, checks, blockers, warnings }
})
