/**
 * GET /api/cluster/prereq?sanIds[]=id1&sanIds[]=id2
 * Vérifie les prérequis cluster sur les SANs spécifiés.
 * Commandes à allowlist stricte — pas d'exec arbitraire.
 */
import { getSSHPool } from '../../utils/ssh-pool'

interface PrereqResult {
  sanId:  string
  checks: PrereqCheck[]
}

interface PrereqCheck {
  label:  string
  ok:     boolean
  detail: string
}

// Checks dynamiques : serverEpoch capturé au moment de la requête pour la vérif horloge
type Check = { label: string; cmd: string; ok: (out: string) => boolean }

function buildChecks(serverEpoch: number): Check[] {
  return [
    { label: 'SSH connecté',             cmd: 'echo ok',                            ok: o => o.includes('ok') },
    { label: 'crm_mon disponible',       cmd: 'which crm_mon',                      ok: o => o.includes('/') },
    { label: 'corosync disponible',      cmd: 'which corosync-quorumtool',          ok: o => o.includes('/') },
    { label: 'crmsh disponible',         cmd: 'which crm',                          ok: o => o.includes('/') },
    { label: 'SCST désactivé (rc.conf)', cmd: 'grep -q \'rc\\.scst_enable="NO"\' /etc/rc.conf 2>/dev/null && echo yes || echo no', ok: o => o.trim() === 'yes' },
    { label: 'rc.conf accessible',       cmd: 'test -r /etc/rc.conf && echo yes',   ok: o => o.includes('yes') },
    {
      label: 'Horloge synchronisée (NTP)',
      cmd:   `node_ts=$(date +%s); diff=$((node_ts - ${serverEpoch})); [ $diff -lt 0 ] && diff=$((-diff)); [ $diff -le 60 ] && echo "ok (decalage $diff""s)" || echo "decalage critique: $diff""s - $(date '+%Y-%m-%d %H:%M:%S %Z')"`,
      ok:    o => o.startsWith('ok'),
    },
  ]
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as { sanIds?: string | string[] }
  const ids   = Array.isArray(query.sanIds)
    ? query.sanIds
    : query.sanIds ? [query.sanIds] : []

  if (ids.length === 0 || ids.length > 10) {
    throw createError({ statusCode: 400, message: 'sanIds requis (max 10)' })
  }

  const CHECKS     = buildChecks(Math.floor(Date.now() / 1000))
  const PROBE_CMDS = CHECKS.map(c => c.cmd).join('; echo "---"; ')

  const pool    = getSSHPool()
  const results = await Promise.all(ids.map(async (sanId): Promise<PrereqResult> => {
    const mgr = pool.get(sanId)
    if (!mgr || mgr.getStatus() !== 'connected') {
      return {
        sanId,
        checks: CHECKS.map(c => ({ label: c.label, ok: false, detail: 'SSH non disponible' })),
      }
    }

    try {
      const result = await mgr.exec(PROBE_CMDS, 15_000)
      const outputs = result.stdout.split('---')
      const checks: PrereqCheck[] = CHECKS.map((c, i) => {
        const out = (outputs[i] ?? '').trim()
        return { label: c.label, ok: c.ok(out), detail: out.slice(0, 80) }
      })
      return { sanId, checks }
    } catch (err: any) {
      return {
        sanId,
        checks: CHECKS.map(c => ({ label: c.label, ok: false, detail: err.message ?? 'Erreur SSH' })),
      }
    }
  }))

  return results
})
