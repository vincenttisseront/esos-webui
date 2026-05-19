<template>
  <section v-if="groups.length" class="space-y-4" aria-labelledby="raid-software-actions-heading">
    <h2 id="raid-software-actions-heading" class="text-base font-semibold text-gray-900 dark:text-gray-100">
      {{ t('raid.cockpit.action.recommended_title') }}
    </h2>

    <div class="grid gap-4 lg:grid-cols-2">
      <article
        v-for="group in groups"
        :key="group.groupKey"
        class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4 space-y-3 shadow-sm"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 pr-2">
            {{ group.title }}
          </h3>
          <UBadge :color="severityColor(group.severity)" :label="severityLabel(group.severity)" size="sm" variant="soft" />
        </div>

        <p v-if="group.affectedPaths.length" class="text-sm">
          <span class="font-medium text-gray-700 dark:text-gray-300">{{ t('raid.cockpit.affected.label') }} :</span>
          <span class="font-mono text-xs text-gray-600 dark:text-gray-400 break-all">{{ affectedText(group) }}</span>
        </p>

        <p class="text-sm text-gray-600 dark:text-gray-400">
          <span class="font-medium text-gray-700 dark:text-gray-300">{{ t('raid.cockpit.impact_label') }} :</span>
          {{ group.impact }}
        </p>

        <p class="text-sm text-gray-600 dark:text-gray-400">
          <span class="font-medium text-gray-700 dark:text-gray-300">{{ t('raid.cockpit.recommendation_label') }} :</span>
          {{ group.recommendation }}
        </p>

        <div v-if="group.primaryActionLabel && group.primaryActionTarget">
          <UButton
            size="md"
            :color="group.severity === 'critical' ? 'red' : 'primary'"
            @click="$emit('action', group.representative)"
          >
            {{ group.primaryActionLabel }}
          </UButton>
        </div>
      </article>
    </div>
  </section>
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

function severityColor(severity: RaidGroupedActionableItem['severity']) {
  if (severity === 'critical') return 'red'
  if (severity === 'warning') return 'amber'
  return 'blue'
}

function severityLabel(severity: RaidGroupedActionableItem['severity']) {
  return t(`raid.software.cockpit.severity.${severity}`)
}

function affectedText(group: RaidGroupedActionableItem) {
  return formatAffectedPaths(group.affectedPaths, t)
}
</script>
