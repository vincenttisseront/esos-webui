<template>
  <div class="space-y-5">
    <div>
      <h3 class="font-semibold text-gray-800">Finalisation du cluster</h3>
      <p class="text-sm text-gray-500 mt-1">
        Attribution des rôles et enregistrement de la configuration cluster en base.
      </p>
    </div>

    <!-- Nom du cluster -->
    <div class="space-y-1.5">
      <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Nom du cluster</label>
      <UInput
        v-model="clusterName"
        placeholder="ex: cluster-prod, cluster-paris…"
        icon="i-heroicons-tag"
        :disabled="saving"
        class="max-w-sm"
      />
      <p v-if="!clusterName.trim()" class="text-xs text-amber-500">Un nom est requis pour identifier ce cluster.</p>
    </div>

    <!-- Warning nœuds retirés -->
    <div v-if="props.removedNodes?.length" class="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
      <div class="text-sm text-amber-800 space-y-1">
        <p class="font-semibold">{{ props.removedNodes.length }} nœud{{ props.removedNodes.length > 1 ? 's' : '' }} sera{{ props.removedNodes.length > 1 ? 'ont' : '' }} retiré{{ props.removedNodes.length > 1 ? 's' : '' }} du cluster</p>
        <ul class="list-disc list-inside text-xs space-y-0.5">
          <li v-for="n in props.removedNodes" :key="n.id" class="font-medium">{{ n.label }} <span class="font-mono font-normal">({{ n.host }})</span></li>
        </ul>
        <p class="text-xs text-amber-600 mt-1">Corosync et Pacemaker seront arrêtés sur ces nœuds. La configuration corosync.conf peut nécessiter une mise à jour manuelle si le nœud figure dans la nodelist.</p>
      </div>
    </div>

    <!-- Attribution des rôles -->
    <div class="space-y-3">
      <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Rôles des nœuds</p>
      <div
        v-for="node in props.nodes"
        :key="node.id"
        class="flex items-center gap-4 rounded-lg border border-gray-200 px-4 py-3"
      >
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-800">{{ node.label }}</p>
          <p class="text-xs text-gray-400 font-mono">{{ node.host }}</p>
        </div>
        <div class="flex rounded-lg overflow-hidden border border-gray-200 shrink-0">
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
            :class="roles[node.id] === 'primary' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
            :disabled="saving"
            @click="setRole(node.id, 'primary')"
          >
            <UIcon name="i-heroicons-star" class="w-3.5 h-3.5" />
            Primaire
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors"
            :class="roles[node.id] === 'secondary' ? 'bg-gray-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
            :disabled="saving"
            @click="setRole(node.id, 'secondary')"
          >
            <UIcon name="i-heroicons-arrow-path-rounded-square" class="w-3.5 h-3.5" />
            Secondaire
          </button>
        </div>
      </div>

      <p v-if="roleError" class="text-xs text-amber-600 flex items-center gap-1.5">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 shrink-0" />
        {{ roleError }}
      </p>
    </div>

    <!-- Vérification état cluster -->
    <div v-if="clusterState" class="rounded-lg border p-4 space-y-3" :class="clusterState.healthy ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'">
      <div class="flex items-center gap-2">
        <UIcon
          :name="clusterState.healthy ? 'i-heroicons-check-circle' : 'i-heroicons-exclamation-triangle'"
          class="w-5 h-5 shrink-0"
          :class="clusterState.healthy ? 'text-green-500' : 'text-amber-500'"
        />
        <p class="text-sm font-medium" :class="clusterState.healthy ? 'text-green-800' : 'text-amber-800'">
          {{ clusterState.healthy ? 'Cluster opérationnel' : 'Cluster partiellement opérationnel' }}
        </p>
        <span class="ml-auto text-xs px-2 py-0.5 rounded-full" :class="clusterState.healthy ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'">
          {{ modeLabel(clusterState.mode) }}
        </span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div
          v-for="node in clusterState.nodes"
          :key="node.nodeId"
          class="flex items-center gap-2 text-xs rounded px-2 py-1.5 bg-white border"
          :class="node.corosyncRunning && node.pacemakerRunning ? 'border-green-200' : 'border-red-200'"
        >
          <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="node.corosyncRunning && node.pacemakerRunning ? 'bg-green-500' : 'bg-red-400'" />
          <span class="font-medium text-gray-700 truncate">{{ nodeLabel(node.nodeId, node.hostname) }}</span>
          <span class="ml-auto text-gray-400">{{ node.pacemakerNodeState }}</span>
        </div>
      </div>
    </div>

    <UAlert v-if="saveError" color="red" variant="soft" :title="saveError" />

    <!-- Erreur de validation des rôles -->
    <UAlert
      v-if="roleError && props.nodes.length > 0"
      color="amber"
      variant="soft"
      :title="roleError"
    />

    <!-- Aucun nœud reçu — diagnostic -->
    <UAlert
      v-if="props.nodes.length === 0"
      color="red"
      variant="soft"
      title="Aucun nœud sélectionné"
      description="Retournez à l'étape 1 pour sélectionner les nœuds du cluster."
    />

    <div class="flex items-center gap-3">
      <UButton
        label="Enregistrer et terminer"
        icon="i-heroicons-check"
        color="green"
        :loading="saving"
        :disabled="!rolesValid || !clusterName.trim() || props.nodes.length === 0"
        @click="finalize"
      />
      <UButton
        label="Vérifier l'état cluster"
        icon="i-heroicons-arrow-path"
        color="gray"
        variant="ghost"
        :loading="checking"
        @click="checkState"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface NodeInfo { id: string; label: string; host: string }

const props = defineProps<{ nodes: NodeInfo[]; initialClusterId?: string | null; initialClusterName?: string | null; removedNodes?: NodeInfo[] }>()
const emit  = defineEmits<{ (e: 'finalized'): void }>()

const roles       = ref<Record<string, 'primary' | 'secondary'>>({})
const clusterName = ref(props.initialClusterName ?? '')
const saving      = ref(false)
const checking    = ref(false)
const saveError   = ref<string | null>(null)
const clusterState = ref<any>(null)
const { success: toastSuccess, error: toastError } = useAppToast()

// Attribue automatiquement : premier nœud = primary, reste = secondary
// Utilise watch pour réagir si nodes arrive après le montage
watch(() => props.nodes, (nodes) => {
  if (nodes.length && !Object.keys(roles.value).length) {
    nodes.forEach((n, i) => {
      roles.value[n.id] = i === 0 ? 'primary' : 'secondary'
    })
  }
}, { immediate: true })

// Pré-remplit le nom depuis l'API si pas déjà connu via le prop
watch(clusterState, (state) => {
  if (state?.clusterName && !props.initialClusterName && !clusterName.value) {
    clusterName.value = state.clusterName
  }
})

onMounted(() => { if (props.nodes.length) checkState() })

const roleError = computed(() => {
  const primaries = props.nodes.filter(n => roles.value[n.id] === 'primary')
  if (primaries.length === 0) return 'Désignez au moins un nœud primaire.'
  if (primaries.length > 1)  return 'Un seul nœud peut être primaire.'
  return null
})

const rolesValid = computed(() => !roleError.value && props.nodes.every(n => roles.value[n.id]))

function setRole(nodeId: string, role: 'primary' | 'secondary') {
  roles.value[nodeId] = role
}

function nodeLabel(nodeId: string, fallback: string): string {
  return props.nodes.find(n => n.id === nodeId)?.label || (fallback === 'localhost' ? nodeId : fallback)
}

const MODE_LABELS: Record<string, string> = {
  'unconfigured':  'Sans ressources',
  'active-passive': 'Actif-passif',
  'active-active':  'Actif-actif',
  'degraded':       'Dégradé',
}
function modeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode
}

async function checkState() {
  checking.value = true
  const ids = props.nodes.map(n => n.id).join(',')
  try {
    clusterState.value = await $fetch('/api/cluster/status', { query: { nodeIds: ids } })
  } catch { /* silencieux */ } finally {
    checking.value = false
  }
}

async function finalize() {
  if (!rolesValid.value || !clusterName.value.trim()) return
  saving.value    = true
  saveError.value = null

  const peersMap    = Object.fromEntries(
    props.nodes.map(n => [n.id, props.nodes.find(p => p.id !== n.id)?.id ?? null]),
  )
  const primaryNode = props.nodes.find(n => roles.value[n.id] === 'primary')

  try {
    // 1. Créer ou réutiliser/renommer le cluster
    let clusterId: string = props.initialClusterId ?? clusterState.value?.clusterId ?? ''
    if (!clusterId) {
      const result = await $fetch<{ id: string }>('/api/admin/clusters', {
        method: 'POST',
        body:   { name: clusterName.value.trim() },
      })
      clusterId = result.id
    } else if (clusterName.value.trim() !== clusterState.value?.clusterName) {
      await $fetch(`/api/admin/clusters/${clusterId}`, {
        method: 'PATCH',
        body:   { name: clusterName.value.trim() },
      })
    }

    // 2. Affecter les nœuds au cluster
    await Promise.all(props.nodes.map(n =>
      $fetch(`/api/admin/sans/${n.id}/cluster`, {
        method: 'PATCH',
        body: {
          clusterEnabled: true,
          clusterRole:    roles.value[n.id],
          clusterPeer:    peersMap[n.id],
          clusterId,
        },
      }),
    ))
    // 3. Retirer les nœuds supprimés de la DB (garanti) + cleanup SSH best-effort
    if (props.removedNodes?.length) {
      // Reset DB immédiat (ne peut pas échouer silencieusement)
      await Promise.all(
        props.removedNodes.map(n =>
          $fetch(`/api/admin/sans/${n.id}/cluster`, {
            method: 'PATCH',
            body:   { clusterEnabled: false, clusterRole: null, clusterPeer: null, clusterId: null },
          }),
        ),
      )
      // Cleanup SSH best-effort (stop corosync/pacemaker + crm node delete)
      Promise.allSettled(
        props.removedNodes.map(n =>
          $fetch('/api/admin/cluster/remove-node', {
            method: 'POST',
            body:   { nodeId: n.id, primaryNodeId: primaryNode?.id, skipDb: true },
          }),
        ),
      )
    }

    toastSuccess('Cluster enregistré', `"${clusterName.value.trim()}" a été configuré avec ${props.nodes.length} nœud(s).`)
    emit('finalized')
  } catch (err: any) {
    saveError.value = err?.data?.message ?? String(err)
  } finally {
    saving.value = false
  }
}
</script>
