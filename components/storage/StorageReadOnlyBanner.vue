<template>
  <div
    v-if="readOnly"
    class="flex items-center gap-2 rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-100"
  >
    <UIcon name="i-heroicons-lock-closed" class="w-3.5 h-3.5 shrink-0" />
    <span>{{ t('storage.readonly.banner') }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ readOnly?: boolean; compact?: boolean }>()
const { t } = useEsosI18n()
</script>
