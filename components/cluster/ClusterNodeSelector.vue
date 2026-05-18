<template>
  <div class="space-y-5">
    <!-- Chargement -->
    <div v-if="loading" class="flex items-center gap-2 text-sm text-gray-400 py-6">
      <span class="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      Chargement…
    </div>

    <div v-else-if="error" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
      {{ error }}
    </div>

    <template v-else>
      <!-- -- Section 1 : clusters existants --------------------------- -->
      <div v-if="existingClusters.length > 0" class="space-y-3">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Clusters existants</p>

        <div
          v-for="cluster in existingClusters"
          :key="cluster.id"
          class="rounded-lg border p-4 space-y-3 transition-colors"
          :class="targetClusterId === cluster.id
            ? 'border-blue-300 bg-blue-50'
            : 'border-gray-200 bg-white'"
        >
          <!-- En-tête cluster -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-blue-500 shrink-0" />
              <span class="text-sm font-semibold text-gray-800">{{ cluster.name }}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">
                {{ cluster.nodes.length }} nœud{{ cluster.nodes.length > 1 ? 's' : '' }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <!-- Bouton : reconfigurer / ajouter un nœud -->
              <UButton
                size="xs"
                variant="soft"
                :color="targetClusterId === cluster.id ? 'blue' : 'gray'"
                :icon="targetClusterId === cluster.id ? 'i-heroicons-check' : 'i-heroicons-pencil-square'"
                :label="targetClusterId === cluster.id ? 'Sélectionné' : 'Reconfigurer'"
                @click="selectTargetCluster(cluster.id)"
              />
              <!-- Bouton supprimer (admin only) -->
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

          <!-- Nœuds membres — cochés par défaut, décochables pour retrait -->
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
              <span class="font-medium truncate flex-1" :class="removedExisting.has(node.id) ? 'text-red-400 line-through' : 'text-gray-700'">{{ node.label }}</span>
              <span class="font-mono truncate" :class="removedExisting.has(node.id) ? 'text-red-300' : 'text-gray-400'">{{ node.host }}</span>
              <span v-if="removedExisting.has(node.id)" class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium shrink-0">Retiré</span>
              <span v-else class="px-1.5 py-0.5 rounded font-medium shrink-0"
                :class="node.clusterRole === 'primary' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'"
              >{{ node.clusterRole === 'primary' ? 'Primaire' : 'Secondaire' }}</span>
            </label>
          </div>
          <!-- Avertissement minimum 2 nœuds -->
          <p
            v-if="targetClusterId === cluster.id && willDissolve"
            class="text-[11px] text-amber-600 flex items-center gap-1 mt-1"
          >
            <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 shrink-0" />
            Le cluster sera dissous — le nœud restant redevient standalone.
          </p>
          <p
            v-else-if="targetClusterId === cluster.id && remainingCount < 2 && !willDissolve"
            class="text-[11px] text-red-500 flex items-center gap-1 mt-1"
          >
            <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 shrink-0" />
            Minimum 2 nœuds requis pour un cluster Pacemaker/Corosync.
          </p>

          <!-- Nœuds libres à ajouter optionnellement (visibles si ce cluster est sélectionné) -->
          <template v-if="targetClusterId === cluster.id">
            <div class="border-t border-blue-200 pt-3 space-y-1.5">
              <p class="text-xs text-blue-600 font-medium">Ajouter des nœuds supplémentaires (optionnel) :</p>
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
                <span class="font-medium text-gray-700 flex-1">{{ san.label }}</span>
                <span class="font-mono text-gray-400">{{ san.host }}</span>
              </label>
              <p v-if="freeNodes.length === 0" class="text-xs text-gray-400 italic">
                Aucun nœud libre disponible — vous pouvez tout de même reconfigurer ce cluster.
              </p>
            </div>
          </template>
        </div>
      </div>

      <!-- -- Section 2 : nœuds libres (nouveau cluster) -------------- -->
      <div class="space-y-3">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {{ existingClusters.length > 0 ? 'Créer un nouveau cluster' : 'Nœuds disponibles' }}
        </p>

        <div v-if="targetClusterId !== null" class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
          Un cluster existant est sélectionné. Désélectionnez-le pour créer un nouveau cluster.
        </div>

        <template v-else>
          <!-- Avertissement -->
          <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div class="text-xs text-amber-700 space-y-0.5">
              <p class="font-semibold">Impact sur les données existantes</p>
              <ul class="list-disc list-inside space-y-0.5">
                <li>La configuration SCST et les volumes sont <strong>préservés</strong>.</li>
                <li>Les sessions iSCSI seront <strong>interrompues</strong> au démarrage de Pacemaker.</li>
              </ul>
            </div>
          </div>

          <p v-if="freeNodes.length === 0" class="text-sm text-gray-400 text-center py-4">
            Tous les nœuds sont déjà membres d'un cluster.
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
              <p class="text-sm font-medium text-gray-800">{{ san.label }}</p>
              <p class="text-xs text-gray-400 font-mono truncate">{{ san.host }}</p>
              <span
                class="text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block"
                :class="san.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'"
              >{{ san.status }}</span>
            </div>
          </label>
        </template>
      </div>
    </template>

    <!-- -- Barre de validation --------------------------------------- -->
    <div v-if="!loading && !error" class="flex items-center justify-between pt-1 border-t border-gray-100">
      <p class="text-xs" :class="canConfirm ? 'text-green-600' : 'text-amber-500'">
        <template v-if="targetClusterId">
          <template v-if="removedExisting.size === 0 && selected.size === 0">Reconfigurer le cluster sélectionné</template>
          <template v-else>
            Reconfigurer
            <template v-if="selected.size > 0"> + {{ selected.size }} nœud{{ selected.size > 1 ? 's' : '' }} à ajouter</template>
            <template v-if="removedExisting.size > 0"> · <span class="text-red-500">{{ removedExisting.size }} à retirer</span></template>
          </template>
        </template>
        <template v-else>
          {{ selected.size }} nœud{{ selected.size > 1 ? 's' : '' }} sélectionné{{ selected.size > 1 ? 's' : '' }}
          <template v-if="selected.size < 2"> — minimum 2 requis</template>
        </template>
      </p>
      <UButton
        :label="willDissolve ? 'Dissoudre le cluster' : 'Confirmer la sélection'"
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

const authStore = useAuthStore()
const isAdmin   = computed(() => authStore.user?.role === 'admin')

const loading          = ref(false)
const error            = ref<string | null>(null)
const sans             = ref<SanSummary[]>([])
const existingClusters = ref<ClusterSummary[]>([])
const selected         = ref<Set<string>>(new Set())
const targetClusterId  = ref<string | null>(null)
const removedExisting  = ref<Set<string>>(new Set())
const deleting         = ref<string | null>(null)

const freeNodes = computed(() => sans.value.filter(s => !s.clusterEnabled))

const remainingCount = computed(() => {
  if (!targetClusterId.value) return selected.value.size
  const cluster = existingClusters.value.find(c => c.id === targetClusterId.value)
  return (cluster?.nodes.length ?? 0) - removedExisting.value.size + selected.value.size
})

// remaining === 1 → dissolution directe sans wizard
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
    error.value = err?.data?.message ?? 'Impossible de charger les données'
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
      // Dissolution directe : 1 seul nœud restant → pas de wizard
      if (willDissolve.value) {
        const ok = await modalConfirm({
          title:        `Dissoudre le cluster « ${cluster.name} »`,
          message:      `Il ne restera qu'un seul nœud. Le cluster sera dissous : Corosync et Pacemaker seront arrêtés et désactivés sur tous les nœuds.`,
          confirmLabel: 'Dissoudre',
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
            toastError('Cluster dissous avec avertissements', result.warnings.join(' · '))
          } else {
            toastSuccess('Cluster dissous', `« ${cluster.name} » a été dissous avec succès.`)
          }
          await load()
        } catch (err: any) {
          const { error: toastError } = useAppToast()
          toastError('Erreur', err?.data?.message ?? 'Impossible de dissoudre le cluster')
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
    title:        `Supprimer le cluster « ${cluster.name} »`,
    message:      `Cette action va arrêter et désactiver Corosync et Pacemaker sur ${cluster.nodes.length} nœud(s) (${cluster.nodes.map(n => n.label).join(', ')}), puis supprimer définitivement la configuration cluster. Les données SCST et volumes ne sont pas affectés.`,
    confirmLabel: 'Supprimer le cluster',
    intent:       'danger',
  })
  if (!confirmed) return

  deleting.value = cluster.id
  const { error: toastError, success: toastSuccess } = useAppToast()
  try {
    const result = await $fetch<{ ok: boolean; warnings?: string[] }>(
      `/api/admin/clusters/${cluster.id}`,
      { method: 'DELETE' },
    )
    if (result.warnings?.length) {
      toastError(
        'Cluster supprimé avec avertissements',
        result.warnings.join(' | '),
      )
    } else {
      toastSuccess('Cluster supprimé', `« ${cluster.name} » a été supprimé avec succès.`)
    }
    await load()
  } catch (err: any) {
    toastError('Erreur', err?.data?.message ?? 'Impossible de supprimer le cluster')
  } finally {
    deleting.value = null
  }
}

onMounted(load)
</script>