<template>
  <BaseModal
    :title="title"
    icon="i-heroicons-exclamation-triangle"
    intent="danger"
    size="sm"
    :closable="!loading"
    @cancel="$emit('cancel')"
  >
    <div class="space-y-4">
      <div class="flex items-center gap-2">
        <RaidRiskBadge :risk="riskLevel" />
      </div>

      <p class="text-sm text-gray-700">{{ description }}</p>

      <div v-if="preflight" class="border border-gray-200 rounded p-3 bg-gray-50">
        <RaidPreflightPanel :preflight="preflight" />
      </div>

      <div v-if="confirmationPhrase" class="space-y-2">
        <p class="text-sm text-gray-600">
          Saisissez exactement
          <code class="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-mono text-xs">{{ confirmationPhrase }}</code>
          pour confirmer :
        </p>
        <UInput
          v-model="inputPhrase"
          :placeholder="confirmationPhrase"
          :color="phraseMatch ? 'green' : 'gray'"
          :disabled="loading"
          class="font-mono"
          @paste.prevent
        />
      </div>

      <label class="flex items-start gap-3 cursor-pointer select-none">
        <input
          v-model="understood"
          type="checkbox"
          :disabled="loading"
          class="mt-0.5 accent-red-500"
        />
        <span class="text-sm text-gray-600">
          Je comprends que cette opération est irréversible et que les données peuvent être perdues.
        </span>
      </label>

      <p v-if="error" class="text-sm text-red-600 flex items-center gap-1">
        <UIcon name="i-heroicons-x-circle" class="w-4 h-4 shrink-0" />
        {{ error }}
      </p>
    </div>

    <template #actions>
      <UButton color="gray" variant="outline" size="sm" :disabled="loading" @click="$emit('cancel')">
        Annuler
      </UButton>
      <UButton
        color="red"
        size="sm"
        :disabled="!canConfirm || loading"
        :loading="loading"
        icon="i-heroicons-bolt"
        @click="handleConfirm"
      >
        Confirmer
      </UButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import type { RaidPreflightResult, RaidRiskLevel } from '~/types/raid'

const props = defineProps<{
  title: string
  description: string
  riskLevel: RaidRiskLevel
  confirmationPhrase?: string
  preflight?: RaidPreflightResult | null
}>()

const emit = defineEmits<{
  confirm: [confirmation: string]
  cancel: []
}>()

const inputPhrase = ref('')
const understood = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

const phraseMatch = computed(() =>
  !props.confirmationPhrase || inputPhrase.value === props.confirmationPhrase,
)

const canConfirm = computed(() =>
  understood.value
  && phraseMatch.value
  && (!props.preflight || props.preflight.ok),
)

function handleConfirm() {
  if (!canConfirm.value) return
  error.value = null
  emit('confirm', inputPhrase.value)
}

defineExpose({ loading, error })
</script>
