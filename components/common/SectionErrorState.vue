<template>
  <div
    class="rounded-lg border px-4 py-4 flex items-start gap-3"
    :class="classes.container"
  >
    <UIcon :name="icon" class="w-5 h-5 shrink-0 mt-0.5" :class="classes.icon" />

    <div class="flex-1 min-w-0">
      <p class="text-sm font-semibold" :class="classes.title">{{ title }}</p>
      <p class="text-xs mt-1" :class="classes.message">{{ error?.message ?? 'Données indisponibles' }}</p>

      <span
        v-if="error?.code"
        class="inline-block font-mono text-[10px] mt-1.5 px-1.5 py-0.5 rounded"
        :class="classes.badge"
      >
        {{ error.code }}
      </span>

      <div class="flex flex-wrap gap-2 mt-3">
        <UButton
          v-if="onRetry"
          size="xs"
          color="gray"
          variant="outline"
          icon="i-heroicons-arrow-path"
          label="Réessayer"
          :loading="retrying"
          @click="handleRetry"
        />

        <UButton
          v-if="isSshError"
          size="xs"
          :color="classes.linkColor as any"
          variant="ghost"
          icon="i-heroicons-key"
          label="Vérifier la config SSH"
          to="/admin/sans"
        />

        <UButton
          v-if="onForceShow"
          size="xs"
          color="gray"
          variant="ghost"
          icon="i-heroicons-pencil-square"
          label="Saisir manuellement"
          @click="onForceShow"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  status:       'error' | 'unavailable'
  error?:       { code: string; message: string } | null
  onRetry?:     (() => Promise<void>) | null
  onForceShow?: (() => void) | null
}>()

const retrying = ref(false)

const isSshError = computed(() =>
  props.error?.code === 'SSH_DOWN' || props.error?.code === 'SSH_TIMEOUT',
)

const variant = computed(() =>
  props.status === 'unavailable' ? 'warning' : 'error',
)

const classes = computed(() => ({
  container: variant.value === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200',
  icon:      variant.value === 'warning' ? 'text-amber-500' : 'text-red-500',
  title:     variant.value === 'warning' ? 'text-amber-800' : 'text-red-800',
  message:   variant.value === 'warning' ? 'text-amber-700' : 'text-red-700',
  badge:     variant.value === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600',
  linkColor: variant.value === 'warning' ? 'amber' : 'red',
}))

const icon = computed(() =>
  isSshError.value ? 'i-heroicons-server' : 'i-heroicons-exclamation-circle',
)

const title = computed(() => {
  if (isSshError.value) return 'Serveur ESOS inaccessible'
  return props.status === 'unavailable' ? 'Section indisponible' : 'Erreur de lecture'
})

async function handleRetry() {
  if (!props.onRetry) return
  retrying.value = true
  try {
    await props.onRetry()
  } finally {
    retrying.value = false
  }
}
</script>
