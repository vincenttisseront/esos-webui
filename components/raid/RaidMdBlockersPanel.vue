<template>
  <UAlert
    v-if="visibleItems.length"
    :title="t('raid.detection.blockers_title')"
    color="amber"
    icon="i-heroicons-exclamation-triangle"
    variant="soft"
  >
    <template #description>
      <ul class="space-y-2 mt-2">
        <li
          v-for="item in visibleItems"
          :key="`${item.nodeSanId}:${item.path}:${item.kind}`"
          class="text-sm flex flex-wrap items-start justify-between gap-2 border-b border-amber-200/50 dark:border-amber-800/50 pb-2 last:border-0 last:pb-0"
        >
          <motion.div class="min-w-0 flex-1">
            <span v-if="item.nodeSanId !== currentSanId" class="font-medium text-amber-900 dark:text-amber-200">
              {{ item.nodeLabel }} —
            </span>
            <span class="font-mono text-xs">{{ item.path }}</span>
            <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{{ item.summary }}</p>
            <p
              v-if="item.recommendedAction && item.recommendedAction !== 'none'"
              class="text-xs text-amber-700 dark:text-amber-300 mt-0.5"
            >
              {{ t(`raid.stopped_md.recommended.${item.recommendedAction}`) }}
            </p>
          </motion.div>
          <div class="flex gap-1 shrink-0">
            <UButton
              v-if="item.nodeSanId !== currentSanId"
              size="xs"
              color="amber"
              variant="soft"
              :to="peerRaidLink(item.nodeSanId)"
            >
              {{ t('raid.detection.view_peer_raid', { label: item.nodeLabel }) }}
            </UButton>
            <UButton
              v-else
              size="xs"
              color="gray"
              variant="soft"
              @click="$emit('navigate', item)"
            >
              {{ t('raid.md_detection.view_in_raid_ui') }}
            </UButton>
          </div>
        </li>
      </ul>
    </template>
  </UAlert>
</template>

<script setup lang="ts">
import type { MdDetectionItem } from '~/types/raid'

const props = defineProps<{
  items: MdDetectionItem[]
  currentSanId: string
  peerRaidLink: (sanId: string) => string
}>()

defineEmits<{
  navigate: [item: MdDetectionItem]
}>()

const { t } = useEsosI18n()

const visibleItems = computed(() =>
  props.items.filter((item) => {
    if (item.recommendedAction && item.recommendedAction !== 'none') return true
    return item.severity === 'warning' || item.severity === 'critical'
  }).slice(0, 12),
)
</script>
