<template>
  <div v-if="groups.length" class="space-y-3">
    <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
      {{ t('raid.cockpit.action.recommended_title') }}
    </h2>

    <motion.div
      class="space-y-3"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :transition="{ duration: 0.2 }"
    >
      <motion.div
        v-for="(group, index) in groups"
        :key="group.groupKey"
        class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 px-4 py-3 space-y-2"
        :initial="{ opacity: 0, y: 6 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ delay: index * 0.04, duration: 0.2 }"
      >
        <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {{ group.title }}
        </p>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          <span class="font-medium text-gray-700 dark:text-gray-300">{{ t('raid.cockpit.impact_label') }} :</span>
          {{ group.impact }}
        </p>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          <span class="font-medium text-gray-700 dark:text-gray-300">{{ t('raid.cockpit.recommendation_label') }} :</span>
          {{ group.recommendation }}
        </p>
        <p v-if="group.affectedPaths.length" class="text-xs text-gray-500 dark:text-gray-400">
          <span class="font-medium text-gray-600 dark:text-gray-300">{{ t('raid.cockpit.affected.label') }} :</span>
          <span class="font-mono">{{ affectedText(group) }}</span>
        </p>
        <div v-if="group.primaryActionLabel && group.primaryActionTarget" class="pt-1">
          <UButton
            size="sm"
            :color="group.severity === 'critical' ? 'red' : 'primary'"
            variant="soft"
            @click="$emit('action', group.representative)"
          >
            {{ group.primaryActionLabel }}
          </UButton>
        </div>
      </motion.div>
    </motion.div>
  </div>
</template>

<script setup lang="ts">
import type { RaidGroupedActionableItem } from '~/types/raid'
import { formatAffectedPaths } from '~/utils/raid-cluster-health-view-model'

defineProps<{
  groups: RaidGroupedActionableItem[]
}>()

defineEmits<{
  action: [item: import('~/types/raid').RaidActionableItem]
}>()

const { t } = useEsosI18n()

function affectedText(group: RaidGroupedActionableItem) {
  return formatAffectedPaths(group.affectedPaths, t)
}
</script>
