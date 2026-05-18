<template>
  <div class="py-12 text-center">
    <p class="text-4xl mb-3">{{ resolvedIcon }}</p>
    <p class="text-gray-500 dark:text-gray-400 font-medium">{{ message }}</p>
    <p
      v-if="subMessage"
      class="text-gray-400 dark:text-gray-500 text-sm mt-1"
    >
      {{ subMessage }}
    </p>
    <p
      v-if="filtered"
      class="text-gray-400 dark:text-gray-500 text-sm mt-1"
    >
      {{ t('common.emptyState.clearFilterHint') }}
    </p>
  </div>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()

const props = defineProps<{
  message: string
  subMessage?: string
  icon?: string
  filtered?: boolean
}>()

const resolvedIcon = computed(() => props.icon ?? '📭')
</script>
