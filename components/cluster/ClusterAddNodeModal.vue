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
      />
    </UFormGroup>
    <UAlert
      color="blue"
      variant="soft"
      icon="i-heroicons-information-circle"
      :title="t('cluster.sync.help_title')"
    >
      <template #description>
        <ul class="list-disc pl-4 text-xs mt-1 space-y-0.5">
          <li v-for="line in syncLines" :key="line">{{ line }}</li>
        </ul>
      </template>
    </UAlert>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <div class="flex justify-end gap-2">
      <UButton color="gray" variant="ghost" @click="$emit('close')">Annuler</UButton>
      <UButton color="primary" :loading="loading" :disabled="!selectedSanId" @click="submit">
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
const error = ref<string | null>(null)
const syncLines = CLUSTER_SYNC_LIMITATION_LINES

const standaloneOptions = computed(() =>
  props.standaloneSans.map(s => ({ value: s.id, label: s.label })),
)

async function submit() {
  if (!selectedSanId.value) return
  loading.value = true
  error.value = null
  try {
    await $fetch('/api/admin/cluster/add-node', {
      method: 'POST',
      body: { clusterId: props.clusterId, sanId: selectedSanId.value, role: 'secondary' },
    })
    toast.success(t('cluster.add_node.success'))
    emit('close')
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    error.value = e.statusMessage || e.message || 'Erreur'
  } finally {
    loading.value = false
  }
}
</script>
