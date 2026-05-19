import { getSSHPool } from './ssh-pool'
import { parseInstalledVersion } from './esos-version-reader'
import type { ClusterSanMember } from './cluster-resolve'

export interface NodeEsosVersion {
  sanId: string
  label: string
  raw: string
  normalized: string
}

export async function readClusterMemberVersions(
  members: ClusterSanMember[],
): Promise<NodeEsosVersion[]> {
  const pool = getSSHPool()
  const results: NodeEsosVersion[] = []

  await Promise.all(
    members.map(async (m) => {
      const mgr = pool.get(m.id)
      if (!mgr || mgr.getStatus() !== 'connected') {
        results.push({ sanId: m.id, label: m.label, raw: '', normalized: '' })
        return
      }
      try {
        const { stdout } = await mgr.exec(
          'cat /etc/esos-release 2>/dev/null || grep -oP \'(?<=VERSION=).*\' /etc/os-release 2>/dev/null || echo ""',
          8_000,
        )
        const raw = stdout.trim().split('\n')[0]?.trim() ?? ''
        const parsed = parseInstalledVersion(raw)
        const normalized = parsed.buildType === 'stable' && parsed.version
          ? parsed.version
          : parsed.raw || raw
        results.push({ sanId: m.id, label: m.label, raw: parsed.raw || raw, normalized })
      } catch {
        results.push({ sanId: m.id, label: m.label, raw: '', normalized: '' })
      }
    }),
  )

  return results
}
