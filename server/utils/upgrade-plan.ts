import { randomUUID } from 'node:crypto'
import { resolveClusterMembers, type ClusterSanMember } from './cluster-resolve'
import { getUpgradePackageStatus } from './upgrade-package-store'
import { saveUpgradePlan } from './upgrade-plan-store'
import type { UpgradePlan, UpgradePlanNode, UpgradePlanStep } from '~/types/upgrade'
import { getDB } from '../db'
import { sans } from '../db/schema'
import { eq } from 'drizzle-orm'
import { createError } from 'h3'

export function buildStandaloneUpgradeSteps(
  stagingId?: string,
  archivePath?: string,
  stagingDir?: string,
): UpgradePlanStep[] {
  const archive = archivePath ?? `/tmp/esos-upgrade-${stagingId ?? '<id>'}.zip`
  const dir = stagingDir ?? `/tmp/esos-upgrade-staging-${stagingId ?? '<id>'}`
  return [
    {
      id: 'precheck',
      kind: 'precheck',
      manual: false,
      commands: ['# Relancer l\'analyse de préparation dans l\'onglet Préparation'],
      notes: ['Vérifier SSH, /tmp ≥ 5 GiB, conf_sync.sh, état cluster si applicable'],
    },
    {
      id: 'conf_sync',
      kind: 'conf_sync',
      manual: true,
      commands: ['conf_sync.sh', '# ou via Administration → Cluster → Synchroniser la configuration'],
      notes: ['Obligatoire avant install/reboot — wiki ESOS Upgrading'],
    },
    {
      id: 'stage_package',
      kind: 'stage_package',
      manual: false,
      commands: [
        `# Archive : ${archive}`,
        `mkdir -p ${dir}`,
        `unzip -q ${archive} -d ${dir}  # ou tar -xzf selon le format`,
        `test -x ${dir}/install.sh`,
      ],
    },
    {
      id: 'install',
      kind: 'install',
      manual: true,
      commands: [`cd ${dir} && ./install.sh`],
      notes: ['Mode upgrade in-place : images primary/secondary, config non modifiée'],
    },
    {
      id: 'verify_config',
      kind: 'verify_config',
      manual: true,
      commands: ['mount | grep esos_conf', 'ls -la /path/to/esos_conf  # vérifier la config sur le média'],
    },
    {
      id: 'reboot',
      kind: 'reboot',
      manual: true,
      commands: ['reboot'],
      notes: ['Fenêtre de maintenance — conserver l\'ancien média de boot si possible'],
    },
    {
      id: 'post_reboot',
      kind: 'post_reboot',
      manual: true,
      commands: ['cat /etc/esos-release'],
      notes: ['Valider la version et le bon slot primary après redémarrage'],
    },
  ]
}

function sortMembersForRollingUpgrade(members: ClusterSanMember[]): ClusterSanMember[] {
  return [...members].sort((a, b) => {
    const ra = a.clusterRole === 'primary' ? 1 : 0
    const rb = b.clusterRole === 'primary' ? 1 : 0
    if (ra !== rb) return ra - rb
    return a.label.localeCompare(b.label)
  })
}

export function buildUpgradePlan(input: {
  sanId?: string
  clusterId?: string
  nodeIds?: string[]
  targetVersion?: string
  packageStagingId?: string
}): UpgradePlan {
  const db = getDB()
  let members: ClusterSanMember[]

  if (input.sanId) {
    const row = db.select().from(sans).where(eq(sans.id, input.sanId)).get()
    if (!row) throw createError({ statusCode: 404, message: 'SAN introuvable' })
    members = [row]
  } else {
    members = resolveClusterMembers({
      clusterId: input.clusterId,
      nodeIds: input.nodeIds,
    })
  }

  if (members.length === 0) {
    throw createError({ statusCode: 400, message: 'Aucun nœud pour le plan' })
  }

  const pkg = input.packageStagingId ? getUpgradePackageStatus(input.packageStagingId) : undefined
  const archivePath = pkg?.remoteArchivePath
  const stagingDir = pkg?.stagingDir
  const stagingId = input.packageStagingId ?? pkg?.stagingId

  const mode = members.length > 1 ? 'cluster_rolling' : 'standalone'
  const ordered = mode === 'cluster_rolling' ? sortMembersForRollingUpgrade(members) : members

  const globalWarnings: string[] = [
    'admin.upgrade.plan.warning.conf_sync',
    'admin.upgrade.plan.warning.keep_old_media',
    'admin.upgrade.plan.warning.one_node_at_a_time',
  ]

  const nodes: UpgradePlanNode[] = ordered.map((m, idx) => ({
    sanId: m.id,
    label: m.label,
    order: idx + 1,
    steps: buildStandaloneUpgradeSteps(stagingId, archivePath, stagingDir),
  }))

  const plan: UpgradePlan = {
    id: randomUUID(),
    createdAt: Date.now(),
    mode,
    targetVersion: input.targetVersion,
    packageStagingId: input.packageStagingId,
    globalWarnings,
    nodes,
  }

  saveUpgradePlan(plan)
  return plan
}
