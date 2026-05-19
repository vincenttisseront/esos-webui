<template>
  <div class="p-6 space-y-4 max-w-lg">
    <h2 class="text-lg font-semibold">{{ t('cluster.add_node.title') }}</h2>
    <UFormGroup :label="t('cluster.add_node.select_san')">
      <USelectMenu
        v-model="selectedSanId"
        :options="standaloneOptions"
        value-attribute="value"
        option-attribute="label"
        placeholder="SAN autonome"
        @update:model-value="runPreflight"
      />
    </UFormGroup>
    <div v-if="preflightLoading" class="text-sm text-gray-500 flex items-center gap-2">
      <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
      {{ t('cluster.add_node.preflight') }}
    </div>
    <ul v-if="preflightChecks.length" class="text-xs space-y-1">
      <li
        v-for="c in preflightChecks"
        :key="c.label"
        :class="c.ok ? 'text-green-700' : 'text-red-700'"
      >
        {{ c.label }} — {{ c.detail }}
      </li>
    </ul>
    <details class="rounded border border-gray-200 px-3 py-2">
      <summary class="cursor-pointer text-sm font-medium text-gray-700 select-none list-none">
        {{ t('cluster.sync.help_title') }}
      </summary>
      <ul class="mt-2 text-xs text-gray-600 list-disc pl-4 space-y-0.5">
        <li v-for="line in syncLines" :key="line">{{ line }}</li>
      </ul>
    </details>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <div class="flex justify-end gap-2">
      <UButton color="gray" variant="ghost" @click="$emit('close')">Annuler</UButton>
      <UButton
        color="primary"
        :loading="loading"
        :disabled="!selectedSanId || !preflightOk || preflightLoading"
        @click="submit"
      >
        {{ t('cluster.add_node.confirm') }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CLUSTER_SYNC_LIMITATION_LINES } from '~/utils/cluster-sync-limitations'

const props = defineProps<{
  clusterId: string
  standaloneSans: Array<{ id: string; label: string }>
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useEsosI18n()
const toast = useAppToast()
const selectedSanId = ref<string | null>(null)
const loading = ref(false)
const preflightLoading = ref(false)
const preflightOk = ref(false)
const preflightChecks = ref<Array<{ label: string; ok: boolean; detail: string }>>([])
const error = ref<string | null>(null)
const syncLines = CLUSTER_SYNC_LIMITATION_LINES

const standaloneOptions = computed(() =>
  props.standaloneSans.map(s => ({ value: s.id, label: s.label })),
)

async function runPreflight() {
  if (!selectedSanId.value) {
    preflightOk.value = false
    preflightChecks.value = []
    return
  }
  preflightLoading.value = true
  try {
    const pre = await $fetch<{
      ok: boolean
      checks: Array<{ label: string; ok: boolean; detail: string }>
      blockers: string[]
    }>('/api/admin/cluster/add-node/preflight', {
      query: { clusterId: props.clusterId, sanId: selectedSanId.value },
    })
    preflightChecks.value = pre.checks ?? []
    preflightOk.value = pre.ok
  } catch {
    preflightOk.value = false
    preflightChecks.value = []
  } finally {
    preflightLoading.value = false
  }
}

async function submit() {
  if (!selectedSanId.value || !preflightOk.value) return
  loading.value = true
  error.value = null
  try {
    const result = await $fetch<{ ok: boolean; warnings?: string[] }>('/api/admin/cluster/add-node', {
      method: 'POST',
      body: { clusterId: props.clusterId, sanId: selectedSanId.value, role: 'secondary' },
    })
    toast.success(t('cluster.add_node.success'))
    if (result.warnings?.length) {
      await modalAlert({
        title: t('cluster.add_node.success'),
        message: result.warnings.join('\n'),
        level: 'warning',
      })
    }
    emit('close')
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    error.value = e.statusMessage || e.message || 'Erreur'
  } finally {
    loading.value = false
  }
}
</script>
