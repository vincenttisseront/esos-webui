<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">

    <!-- Header -->
    <header class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-4">
        <UButton
          to="/admin"
          icon="i-heroicons-arrow-left"
          variant="ghost"
          size="sm"
          color="gray"
        />
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Configuration Cluster HA</h1>
          <p class="text-sm text-gray-500 mt-1">
            Assistant de mise en place Pacemaker / Corosync
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          to="/cluster"
          icon="i-heroicons-chart-bar-square"
          color="gray"
          variant="outline"
          label="Voir le monitoring"
        />
        <UButton
          v-if="!isViewer"
          icon="i-heroicons-plus"
          color="primary"
          variant="soft"
          label="Nouveau cluster"
          @click="selectGroup({ ids: [], nodes: [] })"
        />
      </div>
    </header>

    <!-- Tableau des clusters -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Clusters enregistrés</h2>
        <UBadge color="gray" size="xs">{{ clusterGroups.length }} cluster(s)</UBadge>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-500 font-medium">
            <tr>
              <th class="text-left px-4 py-2.5">Nom du cluster</th>
              <th class="text-left px-4 py-2.5">Nœuds</th>
              <th class="text-left px-4 py-2.5">Hôtes</th>
              <th class="text-left px-4 py-2.5">Rôles</th>
              <th class="text-left px-4 py-2.5">Mode</th>
              <th class="text-left px-4 py-2.5">État</th>
              <th class="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
            <tr
              v-for="group in clusterGroups"
              :key="group.ids.join('|')"
              class="transition-colors"
              :class="[
                !isViewer ? 'cursor-pointer' : 'cursor-default',
                isSelected(group)
                  ? 'bg-primary-50 dark:bg-primary-900/20'
                  : !isViewer ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50' : '',
              ]"
              @click="!isViewer && selectGroup(group)"
            >
              <!-- Nom du cluster -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-primary-400 shrink-0" />
                  <span v-if="groupOverview(group)?.clusterName" class="font-semibold text-gray-800 dark:text-gray-100">
                    {{ groupOverview(group)!.clusterName }}
                  </span>
                  <span v-else-if="groupLoadingMap[group.ids.join('|')]" class="text-gray-400 italic text-xs">
                    Chargement…
                  </span>
                  <span v-else class="text-gray-400 italic text-xs">
                    {{ group.nodes.map(n => n.label).join(' + ') }}
                  </span>
                </div>
              </td>

              <!-- Nœuds -->
              <td class="px-4 py-3">
                <div class="flex flex-col gap-0.5">
                  <span
                    v-for="n in group.nodes"
                    :key="n.id"
                    class="font-medium text-gray-800 dark:text-gray-100"
                  >{{ n.label }}</span>
                </div>
              </td>

              <!-- Hôtes -->
              <td class="px-4 py-3">
                <div class="flex flex-col gap-0.5">
                  <span
                    v-for="n in group.nodes"
                    :key="n.id"
                    class="font-mono text-xs text-gray-500"
                  >{{ n.host }}</span>
                </div>
              </td>

              <!-- Rôles -->
              <td class="px-4 py-3">
                <div class="flex flex-col gap-1">
                  <UBadge
                    v-for="n in group.nodes"
                    :key="n.id"
                    :color="n.role === 'primary' ? 'blue' : 'gray'"
                    variant="soft"
                    size="xs"
                    class="w-fit"
                  >
                    {{ n.role ?? '—' }}
                  </UBadge>
                </div>
              </td>

              <!-- Mode -->
              <td class="px-4 py-3">
                <template v-if="groupOverview(group)">
                  <UBadge
                    :color="modeColor(groupOverview(group)!.mode)"
                    variant="soft"
                    size="xs"
                  >
                    {{ groupOverview(group)!.mode }}
                  </UBadge>
                </template>
                <UIcon
                  v-else-if="groupLoadingMap[group.ids.join('|')]"
                  name="i-heroicons-arrow-path"
                  class="w-3.5 h-3.5 text-gray-400 animate-spin"
                />
                <span v-else class="text-gray-300 text-xs">—</span>
              </td>

              <!-- État -->
              <td class="px-4 py-3">
                <template v-if="groupOverview(group)">
                  <UBadge
                    :color="groupOverview(group)!.healthy ? 'green' : 'red'"
                    variant="soft"
                    size="xs"
                  >
                    {{ groupOverview(group)!.healthy ? 'Sain' : 'Dégradé' }}
                  </UBadge>
                </template>
                <UIcon
                  v-else-if="groupLoadingMap[group.ids.join('|')]"
                  name="i-heroicons-arrow-path"
                  class="w-3.5 h-3.5 text-gray-400 animate-spin"
                />
                <span v-else class="text-gray-300 text-xs">—</span>
              </td>

              <!-- Action -->
              <td class="px-4 py-3 text-right">
                <UButton
                  v-if="!isViewer"
                  size="xs"
                  :color="isSelected(group) ? 'primary' : 'gray'"
                  :variant="isSelected(group) ? 'soft' : 'ghost'"
                  icon="i-heroicons-wrench-screwdriver"
                  :label="isSelected(group) ? 'Sélectionné' : 'Configurer'"
                  @click.stop="selectGroup(group)"
                />
              </td>
            </tr>

            <tr v-if="clusterGroups.length === 0">
              <td colspan="7" class="px-4 py-10 text-center text-gray-400 text-xs italic">
                Aucun cluster configuré. Cliquez sur « Nouveau cluster » pour en créer un.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Panneau de configuration du cluster sélectionné -->
    <template v-if="selectedGroup">

      <!-- Nouveau cluster : wizard directement -->
      <template v-if="selectedGroup.ids.length === 0">
        <UAlert
          color="blue"
          variant="soft"
          icon="i-heroicons-information-circle"
          title="Nouveau cluster"
          description="Aucun nœud pré-sélectionné. L'assistant vous guidera dans le choix des nœuds et la configuration."
        />
        <ClusterSetupWizard @setup-complete="onSetupComplete" />
      </template>

      <!-- Cluster existant -->
      <template v-else>

        <!-- Chargement -->
        <div v-if="cluster.loading && !cluster.overview" class="flex items-center justify-center py-12 text-gray-400">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin mr-3" />
          Chargement du statut cluster…
        </div>

        <template v-else-if="cluster.overview">

          <!-- Cluster configuré -->
          <template v-if="cluster.isConfigured">
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-server-stack" class="w-5 h-5 text-primary-500" />
                <h2 class="font-semibold text-gray-800 dark:text-gray-100">
                  {{ selectedGroup.nodes.map(n => n.label).join(' + ') }}
                </h2>
                <UBadge :color="modeColor(cluster.clusterMode)" variant="soft" size="xs">
                  {{ cluster.clusterMode }}
                </UBadge>
                <UBadge :color="cluster.isHealthy ? 'green' : 'red'" variant="soft" size="xs">
                  {{ cluster.isHealthy ? 'Sain' : 'Dégradé' }}
                </UBadge>
              </div>

              <!-- Nœuds du cluster -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ClusterNodeCard
                  v-for="node in cluster.overview.nodes"
                  :key="node.nodeId"
                  :node="node"
                />
              </div>

              <!-- Action reconfigure -->
              <div class="pt-2 border-t border-gray-100 dark:border-gray-700">
                <p class="text-xs text-gray-500 mb-3">
                  Le cluster est en cours de fonctionnement. Relancer l'assistant peut interrompre les sessions iSCSI actives.
                </p>
                <UButton
                  v-if="!isViewer"
                  color="orange"
                  variant="soft"
                  icon="i-heroicons-wrench-screwdriver"
                  label="Relancer l'assistant de configuration"
                  :loading="reconfiguring"
                  @click="reconfiguring = true"
                />
              </div>
            </div>

            <ClusterSetupWizard
              v-if="reconfiguring"
              @setup-complete="onSetupComplete"
            />
          </template>

          <!-- Cluster non configuré -->
          <template v-else>
            <UAlert
              color="blue"
              variant="soft"
              icon="i-heroicons-information-circle"
              title="Configuration requise"
              description="Le cluster HA n'est pas encore configuré. Suivez l'assistant ci-dessous pour l'initialiser."
            />
            <ClusterSetupWizard @setup-complete="onSetupComplete" />
          </template>

        </template>

        <!-- Erreur -->
        <div v-else-if="cluster.error" class="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <p class="font-semibold">Erreur de chargement</p>
          <p class="mt-1">{{ cluster.error }}</p>
          <UButton
            class="mt-3"
            color="red"
            variant="outline"
            size="xs"
            icon="i-heroicons-arrow-path"
            label="Réessayer"
            @click="cluster.fetch(selectedGroup.ids)"
          />
        </div>

      </template>
    </template>

  </div>
</template>

<script setup lang="ts">
import type { SanSummary } from '~/server/db/repositories/san.repository'
import type { ClusterOverview } from '~/server/utils/types'

definePageMeta({ layout: 'default' })

const cluster = useClusterStore()
const auth = useAuthStore()
const isViewer = computed(() => auth.user?.role === 'viewer')
const reconfiguring = ref(false)

const { data: adminSans } = await useFetch<SanSummary[]>('/api/admin/sans', {
  default: () => [],
})

const activeAdminSans = computed(() =>
  (adminSans.value ?? []).filter(s => s.status === 'active'),
)

// ── Groupes cluster dérivés des SANs ─────────────────────────────────────────

interface ClusterNode {
  id:    string
  label: string
  host:  string
  role:  string | null
}

interface ClusterGroup {
  ids:   string[]
  nodes: ClusterNode[]
}

const clusterGroups = computed<ClusterGroup[]>(() => {
  const seen   = new Set<string>()
  const groups: ClusterGroup[] = []

  for (const san of activeAdminSans.value) {
    if (!san.clusterEnabled || seen.has(san.id)) continue
    const peer = activeAdminSans.value.find(s => s.id === san.clusterPeer)

    const nodes: ClusterNode[] = [
      { id: san.id, label: san.label, host: san.host, role: san.clusterRole ?? null },
      ...(peer ? [{ id: peer.id, label: peer.label, host: peer.host, role: peer.clusterRole ?? null }] : []),
    ]

    groups.push({ ids: nodes.map(n => n.id), nodes })
    seen.add(san.id)
    if (peer) seen.add(peer.id)
  }
  return groups
})

// ── Prépopulation des overviews pour le tableau ───────────────────────────────

const groupOverviewMap  = reactive<Record<string, ClusterOverview>>({})
const groupLoadingMap   = reactive<Record<string, boolean>>({})

function groupKey(group: ClusterGroup) {
  return group.ids.join('|')
}

function groupOverview(group: ClusterGroup): ClusterOverview | undefined {
  return groupOverviewMap[groupKey(group)]
}

async function fetchGroupOverview(group: ClusterGroup) {
  if (!group.ids.length) return
  const key = groupKey(group)
  if (groupLoadingMap[key]) return
  groupLoadingMap[key] = true
  try {
    const overview = await $fetch<ClusterOverview>('/api/cluster/status', {
      query: { nodeIds: group.ids.join(',') },
    })
    groupOverviewMap[key] = overview
  } catch { /* silencieux */ }
  finally { groupLoadingMap[key] = false }
}

onMounted(() => {
  for (const group of clusterGroups.value) {
    fetchGroupOverview(group)
  }
})

watch(clusterGroups, (groups) => {
  for (const group of groups) {
    if (!(groupKey(group) in groupOverviewMap)) {
      fetchGroupOverview(group)
    }
  }
})

// ── Sélection ─────────────────────────────────────────────────────────────────

const selectedGroup = ref<ClusterGroup | null>(null)

function isSelected(group: ClusterGroup) {
  return selectedGroup.value !== null && groupKey(selectedGroup.value) === groupKey(group)
}

function selectGroup(group: ClusterGroup) {
  selectedGroup.value = group
  reconfiguring.value = false
  if (group.ids.length > 0) {
    cluster.fetch(group.ids)
  }
}

function onSetupComplete() {
  reconfiguring.value = false
  if (selectedGroup.value?.ids.length) {
    const g = selectedGroup.value
    cluster.fetch(g.ids)
    fetchGroupOverview(g)
  }
}

function modeColor(mode: string) {
  if (mode === 'active-active')   return 'green'
  if (mode === 'active-passive')  return 'blue'
  if (mode === 'degraded')        return 'red'
  if (mode === 'split-brain')     return 'red'
  return 'gray'
}
</script>
