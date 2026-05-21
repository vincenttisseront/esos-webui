<template>
  <div class="space-y-5">
    <div v-if="loading" class="flex items-center gap-2 text-sm text-gray-400 py-6">
      <span class="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      {{ t('cluster.node_selector.loading') }}
    </div>

    <div v-else-if="error" class="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-600">
      {{ error }}
    </div>

    <template v-else>
      <div v-if="existingClusters.length > 0" class="space-y-3">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">{{ t('cluster.node_selector.existing_clusters') }}</p>

        <div
          v-for="cluster in existingClusters"
          :key="cluster.id"
          class="rounded-lg border p-4 space-y-3 transition-colors"
          :class="targetClusterId === cluster.id
            ? 'border-blue-300 bg-blue-50'
            : 'border-gray-200 bg-white'"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-blue-500 shrink-0" />
              <span class="text-sm font-semibold text-gray-800 dark:text-gray-200">{{ cluster.name }}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">
                {{ t('cluster.node_selector.nodes_count', { count: cluster.nodes.length }) }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                size="xs"
                variant="soft"
                :color="targetClusterId === cluster.id ? 'blue' : 'gray'"
                :icon="targetClusterId === cluster.id ? 'i-heroicons-check' : 'i-heroicons-pencil-square'"
                :label="targetClusterId === cluster.id ? t('cluster.node_selector.selected') : t('cluster.node_selector.reconfigure')"
                @click="selectTargetCluster(cluster.id)"
              />
              <UButton
                v-if="isAdmin"
                size="xs"
                color="red"
                variant="ghost"
                icon="i-heroicons-trash"
                @click="deleteCluster(cluster)"
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label
              v-for="node in cluster.nodes"
              :key="node.id"
              class="flex items-center gap-2 rounded px-2 py-1.5 border text-xs transition-colors"
              :class="targetClusterId === cluster.id
                ? removedExisting.has(node.id)
                  ? 'border-red-200 bg-red-50 cursor-pointer'
                  : 'bg-white border-gray-100 cursor-pointer hover:border-gray-300'
                : 'bg-white border-gray-100'"
              @click.prevent="targetClusterId === cluster.id && toggleExisting(node.id)"
            >
              <template v-if="targetClusterId === cluster.id">
                <input
                  type="checkbox"
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                  :checked="!removedExisting.has(node.id)"
                  @click.stop
                  @change="toggleExisting(node.id)"
                />
              </template>
              <UIcon v-else name="i-heroicons-lock-closed" class="w-3 h-3 text-gray-300 shrink-0" />
              <span class="font-medium truncate flex-1" :class="removedExisting.has(node.id) ? 'text-red-400 line-through' : 'text-gray-700 dark:text-gray-300'">{{ node.label }}</span>
              <span class="font-mono truncate" :class="removedExisting.has(node.id) ? 'text-red-300' : 'text-gray-400'">{{ node.host }}</span>
              <span v-if="removedExisting.has(node.id)" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium shrink-0">{{ t('cluster.node_selector.removed') }}</span>
              <span v-else class="px-1.5 py-0.5 rounded font-medium shrink-0"
                :class="node.clusterRole === 'primary' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'"
              >{{ node.clusterRole === 'primary' ? t('cluster.roles.primary') : t('cluster.roles.secondary') }}</span>
            </label>
          </div>
          <p
            v-if="targetClusterId === cluster.id && willDissolve"
            class="text-[11px] text-amber-600 flex items-center gap-1 mt-1"
          >
            <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 shrink-0" />
            {{ t('cluster.node_selector.dissolve_warning') }}
          </p>
          <p
            v-else-if="targetClusterId === cluster.id && remainingCount < 2 && !willDissolve"
            class="text-[11px] text-red-500 flex items-center gap-1 mt-1"
          >
            <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 shrink-0" />
            {{ t('cluster.node_selector.min_nodes_warning') }}
          </p>

          <template v-if="targetClusterId === cluster.id">
            <div class="border-t border-blue-200 pt-3 space-y-1.5">
              <p class="text-xs text-blue-600 font-medium">{{ t('cluster.node_selector.add_nodes_optional') }}</p>
              <label
                v-for="san in freeNodes"
                :key="san.id"
                class="flex items-center gap-2 rounded px-2 py-1.5 border cursor-pointer text-xs transition-colors"
                :class="selected.has(san.id)
                  ? 'border-blue-300 bg-blue-100'
                  : 'border-gray-200 hover:bg-gray-50'"
              >
                <input
                  type="checkbox"
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  :checked="selected.has(san.id)"
                  @change="toggle(san.id)"
                />
                <span class="font-medium text-gray-700 dark:text-gray-300 flex-1">{{ san.label }}</span>
                <span class="font-mono text-gray-400">{{ san.host }}</span>
              </label>
              <p v-if="freeNodes.length === 0" class="text-xs text-gray-400 italic">
                {{ t('cluster.node_selector.no_free_nodes') }}
              </p>
            </div>
          </template>
        </div>
      </div>

      <div class="space-y-3">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {{ existingClusters.length > 0 ? t('cluster.node_selector.create_new_cluster') : t('cluster.node_selector.available_nodes') }}
        </p>

        <div v-if="targetClusterId !== null" class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 p-3 text-xs text-gray-500 dark:text-gray-400">
          {{ t('cluster.node_selector.cluster_selected_hint') }}
        </div>

        <template v-else>
          <div class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 flex items-start gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div class="text-xs text-amber-700 space-y-0.5">
              <p class="font-semibold">{{ t('cluster.node_selector.impact_title') }}</p>
              <ul class="list-disc list-inside space-y-0.5">
                <li>{{ t('cluster.node_selector.impact_scst_preserved') }}</li>
                <li>{{ t('cluster.node_selector.impact_iscsi_interrupted') }}</li>
              </ul>
            </div>
          </div>

          <p v-if="freeNodes.length === 0" class="text-sm text-gray-400 text-center py-4">
            {{ t('cluster.node_selector.all_nodes_in_cluster') }}
          </p>

          <label
            v-for="san in freeNodes"
            :key="san.id"
            class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors"
            :class="selected.has(san.id)
              ? 'border-blue-300 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'"
          >
            <input
              type="checkbox"
              class="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              :checked="selected.has(san.id)"
              @change="toggle(san.id)"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ san.label }}</p>
              <p class="text-xs text-gray-400 font-mono truncate">{{ san.host }}</p>
              <span
                class="text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block"
                :class="san.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'"
              >{{ san.status }}</span>
            </div>
          </label>
        </template>
      </div>
    </template>

    <div v-if="!loading && !error" class="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
      <p class="text-xs" :class="canConfirm ? 'text-green-600' : 'text-amber-500'">
        <template v-if="targetClusterId">
          <template v-if="removedExisting.size === 0 && selected.size === 0">{{ t('cluster.node_selector.confirm_reconfigure_only') }}</template>
          <template v-else>
            {{ t('cluster.node_selector.confirm_reconfigure_add', { count: selected.size }) }}
            <template v-if="removedExisting.size > 0"> {{ t('cluster.node_selector.confirm_reconfigure_remove', { count: removedExisting.size }) }}</template>
          </template>
        </template>
        <template v-else>
          {{ t('cluster.node_selector.nodes_selected', { count: selected.size }) }}
          <template v-if="selected.size < 2">{{ t('cluster.node_selector.min_two_required') }}</template>
        </template>
      </p>
      <UButton
        :label="willDissolve ? t('cluster.node_selector.dissolve_cluster') : t('cluster.node_selector.confirm_selection')"
        :icon="willDissolve ? 'i-heroicons-trash' : 'i-heroicons-arrow-right'"
        :color="willDissolve ? 'red' : 'primary'"
        :trailing="!willDissolve"
        :disabled="!canConfirm"
        @click="confirm"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface SanSummary {
  id:          string
  label:       string
  host:        string
  status:      string
  clusterEnabled: boolean
  clusterRole: string | null
  clusterId:   string | null
}

interface ClusterSummary {
  id:   string
  name: string
  nodes: { id: string; label: string; host: string; status: string; clusterRole: string | null }[]
}

interface NodeInfo { id: string; label: string; host: string }

const emit = defineEmits<{
  (e: 'nodes-selected', nodes: NodeInfo[], clusterId: string | null, clusterName: string | null, removedNodes: NodeInfo[]): void
}>()

const { t } = useEsosI18n()
const authStore = useAuthStore()
const isAdmin   = computed(() => authStore.user?.role === 'admin')

const loading          = ref(false)
const error            = ref<string | null>(null)
const sans             = ref<SanSummary[]>([])
const existingClusters = ref<ClusterSummary[]>([])
const selected         = ref<Set<string>>(new Set())
const targetClusterId  = ref<string | null>(null)
const removedExisting  = ref<Set<string>>(new Set())

const freeNodes = computed(() => sans.value.filter(s => !s.clusterEnabled))

const remainingCount = computed(() => {
  if (!targetClusterId.value) return selected.value.size
  const cluster = existingClusters.value.find(c => c.id === targetClusterId.value)
  return (cluster?.nodes.length ?? 0) - removedExisting.value.size + selected.value.size
})

const willDissolve = computed(() =>
  !!targetClusterId.value && remainingCount.value === 1 && removedExisting.value.size > 0,
)

const canConfirm = computed(() => {
  if (targetClusterId.value) return remainingCount.value >= 1
  return selected.value.size >= 2
})

async function load() {
  loading.value  = true
  error.value    = null
  selected.value = new Set()
  targetClusterId.value = null
  try {
    const [sansData, clustersData] = await Promise.all([
      $fetch<SanSummary[]>('/api/admin/sans'),
      $fetch<ClusterSummary[]>('/api/admin/clusters'),
    ])
    sans.value             = sansData
    existingClusters.value = clustersData
  } catch (err: any) {
    error.value = err?.data?.message ?? t('cluster.node_selector.load_error')
  } finally {
    loading.value = false
  }
}

function selectTargetCluster(id: string) {
  if (targetClusterId.value === id) {
    targetClusterId.value = null
    selected.value        = new Set()
    removedExisting.value = new Set()
  } else {
    targetClusterId.value = id
    selected.value        = new Set()
    removedExisting.value = new Set()
  }
}

function toggle(id: string) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}

function toggleExisting(id: string) {
  const s = new Set(removedExisting.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  removedExisting.value = s
}

async function confirm() {
  const newNodes: NodeInfo[] = freeNodes.value
    .filter(s => selected.value.has(s.id))
    .map(s => ({ id: s.id, label: s.label, host: s.host }))

  if (targetClusterId.value) {
    const cluster = existingClusters.value.find(c => c.id === targetClusterId.value)
    if (cluster) {
      if (willDissolve.value) {
        const ok = await modalConfirm({
          title:        t('cluster.node_selector.dissolve_modal_title', { name: cluster.name }),
          message:      t('cluster.node_selector.dissolve_modal_message'),
          confirmLabel: t('cluster.node_selector.dissolve_confirm'),
          intent:       'danger',
        })
        if (!ok) return
        const { error: toastError, success: toastSuccess } = useAppToast()
        try {
          const result = await $fetch<{ ok: boolean; warnings?: string[] }>(
            `/api/admin/clusters/${cluster.id}`,
            { method: 'DELETE' },
          )
          if (result.warnings?.length) {
            toastError(t('cluster.node_selector.dissolved_warnings'), result.warnings.join(' · '))
          } else {
            toastSuccess(
              t('cluster.node_selector.dissolved_success_title'),
              t('cluster.node_selector.dissolved_success_body', { name: cluster.name }),
            )
          }
          await load()
        } catch (err: any) {
          toastError(t('common.error'), err?.data?.message ?? t('cluster.node_selector.dissolve_error'))
        }
        return
      }

      const kept: NodeInfo[]    = cluster.nodes.filter(n => !removedExisting.value.has(n.id)).map(n => ({ id: n.id, label: n.label, host: n.host }))
      const removed: NodeInfo[] = cluster.nodes.filter(n =>  removedExisting.value.has(n.id)).map(n => ({ id: n.id, label: n.label, host: n.host }))
      emit('nodes-selected', [...kept, ...newNodes], targetClusterId.value, cluster.name, removed)
      return
    }
  }

  emit('nodes-selected', newNodes, null, null, [])
}

async function deleteCluster(cluster: ClusterSummary) {
  const confirmed = await modalConfirm({
    title:        t('cluster.node_selector.delete_modal_title', { name: cluster.name }),
    message:      t('cluster.node_selector.delete_modal_message', {
      count: cluster.nodes.length,
      labels: cluster.nodes.map(n => n.label).join(', '),
    }),
    confirmLabel: t('cluster.node_selector.delete_confirm'),
    intent:       'danger',
  })
  if (!confirmed) return

  const { error: toastError, success: toastSuccess } = useAppToast()
  try {
    const result = await $fetch<{ ok: boolean; warnings?: string[] }>(
      `/api/admin/clusters/${cluster.id}`,
      { method: 'DELETE' },
    )
    if (result.warnings?.length) {
      toastError(t('cluster.node_selector.deleted_warnings'), result.warnings.join(' | '))
    } else {
      toastSuccess(
        t('cluster.node_selector.deleted_success_title'),
        t('cluster.node_selector.deleted_success_body', { name: cluster.name }),
      )
    }
    await load()
  } catch (err: any) {
    toastError(t('common.error'), err?.data?.message ?? t('cluster.node_selector.delete_error'))
  }
}

onMounted(load)
</script>
