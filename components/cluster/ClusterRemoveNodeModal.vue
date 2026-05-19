<template>
  <div class="p-6 space-y-4 max-w-lg">
    <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ t('cluster.remove_node.title') }}</h2>
    <p class="text-sm text-gray-600 dark:text-gray-400">
      {{ nodeLabel }} — {{ clusterName }}
    </p>
    <div v-if="preflightLoading" class="text-sm text-gray-500 flex items-center gap-2">
      <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
      {{ t('cluster.remove_node.preflight') }}
    </div>
    <UAlert
      v-for="b in preflightBlockers"
      :key="b"
      color="red"
      variant="soft"
      :title="b"
    />
    <UAlert
      v-if="isPrimary"
      color="amber"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :title="t('cluster.remove_node.primary_title')"
      :description="t('cluster.remove_node.primary_hint')"
    />
    <p v-if="loading" class="text-sm text-gray-500 flex items-center gap-2">
      <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
      {{ t('cluster.remove_node.in_progress') }}
    </p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <ul v-if="warnings.length" class="text-xs text-amber-700 list-disc pl-4 space-y-0.5">
      <li v-for="w in warnings" :key="w">{{ w }}</li>
    </ul>
    <div class="flex justify-end gap-2 pt-2">
      <UButton color="gray" variant="ghost" :disabled="loading" @click="$emit('close')">
        Annuler
      </UButton>
      <UButton
        color="red"
        :loading="loading"
        :disabled="preflightBlockers.length > 0 || preflightLoading"
        @click="confirmRemove"
      >
        {{ t('cluster.remove_node.confirm') }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  nodeId: string
  nodeLabel: string
  clusterId: string
  clusterName: string
  primaryNodeId?: string | null
  isPrimary: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useEsosI18n()
const toast = useAppToast()
const loading = ref(false)
const preflightLoading = ref(true)
const preflightBlockers = ref<string[]>([])
const error = ref<string | null>(null)
const warnings = ref<string[]>([])

onMounted(async () => {
  try {
    const pre = await $fetch<{
      ok: boolean
      blockers: string[]
      warnings: string[]
    }>('/api/admin/cluster/remove-node/preflight', {
      query: { clusterId: props.clusterId, nodeId: props.nodeId },
    })
    preflightBlockers.value = pre.blockers ?? []
    if (pre.warnings?.length) warnings.value = [...pre.warnings]
  } catch {
    preflightBlockers.value = []
  } finally {
    preflightLoading.value = false
  }
})

async function confirmRemove() {
  loading.value = true
  error.value = null
  try {
    const result = await $fetch<{ ok: boolean; warnings?: string[] }>('/api/admin/cluster/remove-node', {
      method: 'POST',
      body: {
        nodeId: props.nodeId,
        clusterId: props.clusterId,
        primaryNodeId: props.primaryNodeId ?? undefined,
      },
    })
    if (result.warnings?.length) warnings.value = result.warnings
    toast.success(t('cluster.remove_node.success'))
    emit('close')
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    error.value = e.statusMessage || e.message || 'Erreur'
  } finally {
    loading.value = false
  }
}
</script>
