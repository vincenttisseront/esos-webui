<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">

    <!-- Header -->
    <header class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2">
        <UButton
          v-if="selected"
          icon="i-heroicons-arrow-left"
          color="gray"
          variant="ghost"
          size="sm"
          @click="back"
        />
        <div>
          <h1 class="text-2xl font-bold text-gray-900">
            {{ selected ? selected.name : 'Cluster HA' }}
          </h1>
          <p class="text-sm text-gray-500 mt-1">
            {{ selected
              ? 'État Pacemaker / Corosync · Ressources cluster · Groupes ALUA'
              : 'Sélectionnez un cluster pour accéder à son monitoring' }}
          </p>
        </div>
      </div>

      <div class="flex gap-2 shrink-0">
        <UButton
          to="/admin/cluster"
          icon="i-heroicons-wrench-screwdriver"
          color="gray"
          variant="outline"
          label="Configurer"
        />
        <template v-if="selected">
          <UButton
            v-if="!isViewer"
            icon="i-heroicons-arrow-path-rounded-square"
            color="gray"
            variant="outline"
            label="Synchroniser"
            :loading="syncing"
            @click="syncCluster"
          />
          <UButton
            icon="i-heroicons-arrow-path"
            color="gray"
            variant="soft"
            label="Actualiser"
            :loading="detailLoading"
            @click="loadDetail"
          />
        </template>
      </div>
    </header>

    <!-- ── VUE LISTE ────────────────────────────────────────────────── -->
    <template v-if="!selected">

      <div v-if="listLoading" class="flex items-center justify-center py-16 text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin mr-3" />
        Chargement des clusters…
      </div>

      <div v-else-if="clusters.length === 0" class="rounded-xl border border-blue-200 bg-blue-50 px-6 py-8 flex flex-col items-center gap-4 text-center">
        <UIcon name="i-heroicons-server-stack" class="w-12 h-12 text-blue-300" />
        <div>
          <p class="text-base font-semibold text-blue-900">Aucun cluster HA configuré</p>
          <p class="text-sm text-blue-700 mt-1">Initialisez un cluster via l'assistant de configuration.</p>
        </div>
        <UButton to="/admin/cluster" icon="i-heroicons-wrench-screwdriver" label="Configurer le cluster" color="primary" />
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="c in clusters"
          :key="c.id"
          class="rounded-xl border border-gray-200 bg-white p-5 space-y-4 hover:border-blue-300 hover:shadow-sm transition cursor-pointer"
          @click="select(c)"
        >
          <!-- Nom + nœud count -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-server-stack" class="w-5 h-5 text-blue-500 shrink-0" />
              <span class="text-base font-semibold text-gray-800">{{ c.name }}</span>
            </div>
            <span class="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium border border-blue-100 shrink-0">
              {{ c.nodes.length }} nœud{{ c.nodes.length > 1 ? 's' : '' }}
            </span>
          </div>

          <!-- Nœuds -->
          <div class="space-y-1.5">
            <div
              v-for="n in c.nodes"
              :key="n.id"
              class="flex items-center gap-2 text-xs text-gray-600"
            >
              <span class="w-1.5 h-1.5 rounded-full shrink-0"
                :class="n.status === 'active' ? 'bg-green-400' : 'bg-gray-300'" />
              <span class="font-medium">{{ n.label }}</span>
              <span
                v-if="!isViewer && 'host' in n && n.host"
                class="font-mono text-gray-400 truncate"
              >{{ n.host }}</span>
              <span class="ml-auto px-1.5 py-0.5 rounded font-medium"
                :class="n.clusterRole === 'primary' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'">
                {{ n.clusterRole === 'primary' ? 'Primaire' : 'Secondaire' }}
              </span>
            </div>
          </div>

          <!-- CTA -->
          <div class="pt-1 flex justify-end">
            <UButton size="xs" color="blue" variant="soft" icon="i-heroicons-arrow-right" trailing label="Voir le monitoring" @click.stop="select(c)" />
          </div>
        </div>
      </div>

    </template>

    <!-- ── VUE DÉTAIL ───────────────────────────────────────────────── -->
    <template v-else>

      <div v-if="detailLoading && !overview" class="flex items-center justify-center py-16 text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin mr-3" />
        Chargement du statut cluster…
      </div>

      <template v-else-if="overview">
        <div class="flex flex-wrap items-center gap-2">
          <ClusterHealthBadge :health="attention?.health" />
          <UBadge v-if="attention?.attentionCount" color="gray" variant="subtle" size="xs">
            {{ attention.attentionCount }} {{ t('cluster.attention.title').toLowerCase() }}
          </UBadge>
        </div>

        <ClusterStatusBanner :overview="overview" />

        <ClusterAttentionPanel
          v-if="attention?.attentionPoints?.length"
          :points="attention.attentionPoints"
          @action="handleAttentionAction"
        />

        <ClusterStorageConsistencyPanel :data="storageConsistency" />

        <details class="rounded-lg border border-gray-200 bg-white px-3 py-2">
          <summary class="cursor-pointer text-sm font-medium text-gray-700 select-none list-none">
            {{ t('cluster.sync.help_title') }}
          </summary>
          <ul class="mt-2 text-xs text-gray-600 list-disc pl-4 space-y-0.5">
            <li v-for="line in syncLimitationLines" :key="line">{{ line }}</li>
          </ul>
        </details>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ClusterNodeCard
            v-for="node in overview.nodes"
            :key="node.nodeId"
            :node="node"
            @refresh="loadDetail"
          />
        </div>

        <ClusterModeInfo :mode="overview.mode" />

        <p class="text-xs text-gray-400 text-right">
          Dernière lecture : {{ new Date(overview.scannedAt).toLocaleTimeString('fr-FR') }}
        </p>
      </template>

      <div v-else-if="detailError" class="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        <p class="font-semibold">Erreur de chargement</p>
        <p class="mt-1">{{ detailError }}</p>
      </div>

    </template>

  </div>
</template>

<script setup lang="ts">
import { CLUSTER_SYNC_LIMITATION_LINES } from '~/utils/cluster-sync-limitations'
import { useClusterAttentionAction } from '~/composables/useClusterAttentionAction'
import type { ClusterWithNodes } from '~/server/api/admin/clusters/index.get'
import type { ClusterSelectionDto } from '~/server/utils/selection-context'
import type { ClusterAttentionResponse, ClusterStorageConsistencyResult } from '~/types/cluster-admin'
import type { ClusterOverview } from '~/server/utils/types'

type ClusterListEntry = ClusterWithNodes | ClusterSelectionDto

const auth = useAuthStore()
const isViewer = computed(() => auth.user?.role === 'viewer')
const route = useRoute()
const { t } = useEsosI18n()
const { handleAttentionAction } = useClusterAttentionAction()

const sanSelector = useSelectedSan()
const syncLimitationLines = CLUSTER_SYNC_LIMITATION_LINES

// ── Liste ────────────────────────────────────────────────────────────────────
const clusters    = ref<ClusterListEntry[]>([])
const listLoading = ref(false)

async function loadList() {
  listLoading.value = true
  try {
    if (!auth.fetched) {
      await auth.fetchMe()
    }
    if (isViewer.value) {
      if (!sanSelector.clusters.value.length) {
        await sanSelector.fetchSans()
      }
      clusters.value = [...sanSelector.clusters.value]
    } else {
      clusters.value = await $fetch<ClusterWithNodes[]>('/api/admin/clusters')
    }
  } finally {
    listLoading.value = false
  }
}

// ── Sélection / détail ───────────────────────────────────────────────────────
const selected     = ref<ClusterListEntry | null>(null)
const overview     = ref<ClusterOverview | null>(null)
const attention    = ref<ClusterAttentionResponse | null>(null)
const storageConsistency = ref<ClusterStorageConsistencyResult | null>(null)
const detailLoading = ref(false)
const detailError   = ref<string | null>(null)
let   pollTimer: ReturnType<typeof setInterval> | null = null

function clusterIdFor(entry: ClusterListEntry): string {
  return entry.id
}

async function loadDetail() {
  if (!selected.value) return
  detailLoading.value = true
  detailError.value   = null
  const cid = clusterIdFor(selected.value)
  try {
    if (cid) {
      const [statusRes, attentionRes, storageRes] = await Promise.all([
        $fetch<ClusterOverview>('/api/cluster/status', { query: { clusterId: cid } }),
        $fetch<ClusterAttentionResponse>('/api/cluster/attention', { query: { clusterId: cid, includeMd: 'true' } }),
        $fetch<ClusterStorageConsistencyResult>('/api/cluster/storage-consistency', { query: { clusterId: cid } }),
      ])
      overview.value = statusRes
      attention.value = attentionRes
      storageConsistency.value = storageRes
    } else {
      const ids = selected.value.nodes.map(n => n.id).join(',')
      overview.value = await $fetch<ClusterOverview>('/api/cluster/status', { query: { nodeIds: ids } })
      attention.value = null
      storageConsistency.value = null
    }
  } catch (err: any) {
    detailError.value = err?.data?.message ?? 'Erreur de chargement'
  } finally {
    detailLoading.value = false
  }
}

function select(c: ClusterListEntry) {
  selected.value = c
  overview.value = null
  attention.value = null
  storageConsistency.value = null
  loadDetail()
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(loadDetail, 30_000)
}

function trySelectFromQuery() {
  const q = route.query.clusterId
  const clusterId = typeof q === 'string' ? q : null
  if (!clusterId || !clusters.value.length) return
  const match = clusters.value.find(c => clusterIdFor(c) === clusterId)
  if (match) select(match)
}

// Pause le polling si l'onglet est en arrière-plan
if (typeof document !== 'undefined') {
  const onVisibility = () => {
    if (document.hidden) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    } else if (selected.value && !pollTimer) {
      pollTimer = setInterval(loadDetail, 30_000)
      loadDetail()
    }
  }
  onMounted(() => document.addEventListener('visibilitychange', onVisibility))
  onUnmounted(() => document.removeEventListener('visibilitychange', onVisibility))
}

function back() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  selected.value = null
  overview.value = null
}

// ── Sync ─────────────────────────────────────────────────────────────────────
const syncing = ref(false)

async function syncCluster() {
  if (isViewer.value || !selected.value) return
  syncing.value = true
  try {
    const cid = clusterIdFor(selected.value)
    const body = cid
      ? { clusterId: cid }
      : { nodeIds: selected.value.nodes.map(n => n.id) }
    const result  = await $fetch<{ output: string }>('/api/cluster/sync', { method: 'POST', body })
    useAppToast().success('Synchronisation réussie', result.output.slice(0, 120))
    await loadDetail()
  } catch (err: any) {
    useAppToast().error('Erreur de synchronisation', err?.data?.message ?? 'Erreur inconnue')
  } finally {
    syncing.value = false
  }
}

onMounted(async () => {
  await loadList()
  trySelectFromQuery()
})

watch(() => route.query.clusterId, () => {
  if (!selected.value) trySelectFromQuery()
})

onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>
