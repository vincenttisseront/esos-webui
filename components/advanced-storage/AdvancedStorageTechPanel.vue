<template>
  <UCard :id="panelId">
    <template #header>
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ title }}</h3>
        <UBadge :color="presenceColor" size="xs" variant="subtle">{{ presenceLabel }}</UBadge>
      </div>
    </template>
    <div v-if="showService" class="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400 mb-3">
      <span v-if="enabled !== undefined && enabled !== null">
        {{ t('advanced_storage.service.enabled') }}:
        <strong>{{ enabled ? t('advanced_storage.presence.active') : t('advanced_storage.service.disabled') }}</strong>
      </span>
      <span v-if="running !== undefined && running !== null">
        {{ t('advanced_storage.service.running') }}:
        <strong>{{ running ? t('advanced_storage.service.running') : t('advanced_storage.service.stopped') }}</strong>
      </span>
    </div>
    <slot />
  </UCard>
</template>

<script setup lang="ts">
import type { TechPresence } from '~/types/advanced-storage'

const props = defineProps<{
  panelId: string
  title: string
  presence: TechPresence
  enabled?: boolean | null
  running?: boolean | null
  showService?: boolean
}>()

const { t } = useEsosI18n()

const presenceLabel = computed(() =>
  t(`advanced_storage.presence.${props.presence}` as 'advanced_storage.presence.active'),
)

const presenceColor = computed(() => {
  switch (props.presence) {
    case 'active': return 'green'
    case 'configured': return 'amber'
    case 'installed': return 'blue'
    default: return 'gray'
  }
})
</script>
