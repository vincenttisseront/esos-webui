<template>
  <details v-if="logs?.trim()" class="mt-2">
    <summary class="text-xs text-gray-500 cursor-pointer">
      {{ t('admin.deployment.job.logs') }}
    </summary>
    <pre class="text-xs mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-300 max-h-48 overflow-auto rounded bg-gray-50 dark:bg-gray-900 p-2">{{ logs }}</pre>
  </details>
  <p v-else-if="errorMessage" class="text-xs text-red-600 mt-1">{{ errorMessage }}</p>
</template>

<script setup lang="ts">
defineProps<{
  logs?: string
  errorMessage?: string | null
}>()

const { t } = useEsosI18n()
</script>
