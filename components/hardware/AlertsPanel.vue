<template>
  <UCard v-if="alerts.length > 0">
    <template #header>
      <div class="flex items-center gap-2">
        <span class="text-lg font-semibold">{{ t('alerts.panel.title') }}</span>
        <UBadge color="red" variant="soft" size="xs">{{ alerts.length }}</UBadge>
      </div>
    </template>

    <div class="divide-y divide-gray-100 dark:divide-gray-800">
      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
      >
        <UBadge
          :color="alert.level === 'error' ? 'red' : 'yellow'"
          variant="soft"
          size="xs"
          class="mt-0.5 shrink-0"
        >
          {{ alert.level === 'error' ? t('alerts.level.error') : t('alerts.level.warning') }}
        </UBadge>
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ alert.title }}</p>
          <p class="text-xs text-gray-500 mt-0.5">{{ alert.message }}</p>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { Alert } from '~/server/utils/types'

const { t } = useEsosI18n()

defineProps<{ alerts: Alert[] }>()
</script>
