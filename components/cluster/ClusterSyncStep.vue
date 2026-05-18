<template>
  <div class="space-y-5">
    <div>
      <h3 class="font-semibold text-gray-800">Synchronisation de la configuration</h3>
      <p class="text-sm text-gray-500 mt-1">
        Lance <code class="bg-gray-100 px-1 rounded font-mono">conf_sync.sh</code> sur le nœud primaire
        pour propager la configuration vers les autres nœuds.
      </p>
    </div>

    <!-- Résultat précédent -->
    <div v-if="output" class="rounded-lg border p-3" :class="success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'">
      <div class="flex items-center gap-2 mb-2">
        <UIcon
          :name="success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
          class="w-4 h-4"
          :class="success ? 'text-green-500' : 'text-red-500'"
        />
        <span class="text-sm font-medium" :class="success ? 'text-green-700' : 'text-red-700'">
          {{ success ? 'Synchronisation réussie' : 'Synchronisation échouée' }}
        </span>
      </div>
      <pre v-if="output" class="text-xs font-mono text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">{{ output }}</pre>
    </div>

    <div class="flex gap-2">
      <UButton
        label="Synchroniser la configuration"
        icon="i-heroicons-arrow-path-rounded-square"
        :loading="loading"
        :disabled="!props.nodes?.length"
        @click="sync"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface NodeInfo { id: string; label: string; host: string }

const props = defineProps<{ nodes?: NodeInfo[] }>()
const emit    = defineEmits<{ (e: 'synced'): void }>()
const loading = ref(false)
const output  = ref('')
const success = ref(false)

async function sync() {
  if (!props.nodes?.length) {
    output.value  = 'Synchronisation impossible : aucun nœud du cluster n’est connu à cette étape.'
    success.value = false
    return
  }

  loading.value = true
  output.value  = ''
  success.value = false
  try {
    const res = await $fetch<{ ok: boolean; output: string }>('/api/cluster/sync', {
      method: 'POST',
      body: { nodeIds: props.nodes.map(n => n.id) },
    })
    output.value  = res.output
    success.value = res.ok
    if (res.ok) emit('synced')
  } catch (err: any) {
    output.value  = err?.data?.message ?? String(err)
    success.value = false
  } finally {
    loading.value = false
  }
}
</script>
