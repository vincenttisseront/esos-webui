<template>
  <motion.div
    v-if="visibleItems.length"
    class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 space-y-3"
    :initial="{ opacity: 0, y: 8 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="{ duration: 0.22 }"
  >
    <p class="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
      <UIcon name="i-heroicons-light-bulb" class="w-4 h-4" />
      {{ t('raid.cockpit.action.recommended_title') }}
    </p>

    <ul class="space-y-3">
      <motion.li
        v-for="(item, index) in visibleItems"
        :key="item.id"
        class="rounded-lg border border-amber-100 dark:border-amber-900/50 bg-white/80 dark:bg-gray-900/40 px-3 py-2.5 space-y-1.5"
        :initial="{ opacity: 0, x: -8 }"
        :animate="{ opacity: 1, x: 0 }"
        :transition="{ delay: index * 0.06, duration: 0.2 }"
      >
        <motion.div
          class="flex flex-wrap items-start justify-between gap-2"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :transition="{ delay: index * 0.06 + 0.04 }"
        >
          <motion.div
            class="min-w-0 flex-1 space-y-1"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
          >
            <div class="flex items-center gap-2 flex-wrap">
              <UBadge :color="severityColor(item.severity)" variant="soft" size="xs">
                {{ item.severity === 'critical' ? t('raid.cockpit.health.critical') : item.severity === 'warning' ? t('raid.cockpit.health.warning') : 'Info' }}
              </UBadge>
              <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ item.title }}</span>
            </div>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              <span class="font-medium text-gray-700 dark:text-gray-300">{{ t('raid.cockpit.impact_label') }}:</span>
              {{ item.impact }}
            </p>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              <span class="font-medium text-gray-700 dark:text-gray-300">{{ t('raid.cockpit.recommendation_label') }}:</span>
              {{ item.recommendation }}
            </p>
          </motion.div>
          <UButton
            v-if="item.primaryActionLabel && item.primaryActionTarget"
            size="xs"
            :color="item.severity === 'critical' ? 'red' : 'amber'"
            variant="soft"
            class="shrink-0"
            @click="$emit('action', item)"
          >
            {{ item.primaryActionLabel }}
          </UButton>
        </motion.div>
      </motion.li>
    </ul>

    <details v-if="overflowItems.length" class="text-xs">
      <summary class="cursor-pointer text-amber-800 dark:text-amber-300 py-1">
        {{ t('raid.cockpit.action.show_all', { count: items.length }) }}
      </summary>
      <ul class="mt-2 space-y-2">
        <li
          v-for="item in overflowItems"
          :key="item.id"
          class="flex flex-wrap items-start justify-between gap-2 rounded border border-gray-200 dark:border-gray-700 px-2 py-1.5"
        >
          <span class="text-sm font-medium">{{ item.title }}</span>
          <UButton
            v-if="item.primaryActionLabel"
            size="xs"
            color="gray"
            variant="soft"
            @click="$emit('action', item)"
          >
            {{ item.primaryActionLabel }}
          </UButton>
        </li>
      </ul>
    </details>
  </motion.div>
</template>

<script setup lang="ts">
import type { RaidActionableItem } from '~/types/raid'
import { prioritySortActionable } from '~/utils/raid-cluster-health-view-model'

const props = withDefaults(defineProps<{
  items: RaidActionableItem[]
  maxVisible?: number
}>(), {
  maxVisible: 3,
})

defineEmits<{
  action: [item: RaidActionableItem]
}>()

const { t } = useEsosI18n()

const sorted = computed(() => prioritySortActionable(props.items))

const visibleItems = computed(() => sorted.value.slice(0, props.maxVisible))

const overflowItems = computed(() => sorted.value.slice(props.maxVisible))

function severityColor(severity: RaidActionableItem['severity']) {
  if (severity === 'critical') return 'red'
  if (severity === 'warning') return 'amber'
  return 'blue'
}
</script>
