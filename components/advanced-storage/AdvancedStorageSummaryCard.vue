<template>
  <button
    type="button"
    class="text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 hover:border-primary-400 dark:hover:border-primary-500 transition-colors w-full"
    @click="emit('select', tech.id)"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2">
        <UIcon :name="icon" class="w-5 h-5 text-primary-500 shrink-0" />
        <span class="font-medium text-sm text-gray-900 dark:text-gray-100">{{ label }}</span>
      </div>
      <UBadge :color="presenceColor" size="xs" variant="subtle">
        {{ presenceLabel }}
      </UBadge>
    </div>
    <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
      {{ t('advanced_storage.panels.resources') }}: {{ tech.resourceCount }}
    </p>
  </button>
</template>

<script setup lang="ts">
import type { AdvancedStorageTechSummary, AdvancedTechId } from '~/types/advanced-storage'

const props = defineProps<{ tech: AdvancedStorageTechSummary }>()
const emit = defineEmits<{ select: [id: AdvancedTechId] }>()
const { t } = useEsosI18n()

const TECH_ICONS: Record<string, string> = {
  drbd: 'i-heroicons-arrows-right-left',
  multipath: 'i-heroicons-share',
  zfs: 'i-heroicons-circle-stack',
  mhvtl: 'i-heroicons-server',
  bcache: 'i-heroicons-bolt',
  dm_cache: 'i-heroicons-cpu-chip',
  lvm_cache: 'i-heroicons-squares-2x2',
  ceph_rbd: 'i-heroicons-cloud',
  deprecated_lessfs: 'i-heroicons-exclamation-triangle',
}

const label = computed(() => {
  const key = props.tech.id.startsWith('deprecated') ? 'deprecated' : props.tech.id
  return t(`advanced_storage.tech.${key}` as 'advanced_storage.tech.drbd')
})

const icon = computed(() => TECH_ICONS[props.tech.id] ?? 'i-heroicons-cube')

const presenceLabel = computed(() =>
  t(`advanced_storage.presence.${props.tech.presence}` as 'advanced_storage.presence.active'),
)

const presenceColor = computed(() => {
  switch (props.tech.presence) {
    case 'active': return 'green'
    case 'configured': return 'amber'
    case 'installed': return 'blue'
    default: return 'gray'
  }
})
</script>
