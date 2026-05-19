<template>
  <UCard class="overflow-hidden">
    <motion.div
      class="space-y-4"
      :initial="{ opacity: 0, y: 6 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.2 }"
    >
      <motion.div
        class="flex flex-wrap items-start justify-between gap-3"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :transition="{ delay: 0.05 }"
      >
        <motion.div
          class="flex items-center gap-3"
          :initial="{ scale: 0.92, opacity: 0 }"
          :animate="{ scale: 1, opacity: 1 }"
          :transition="{ type: 'spring', stiffness: 320, damping: 22 }"
        >
          <UBadge :color="healthColor" variant="solid" size="lg" class="text-sm font-semibold px-3 py-1">
            {{ healthLabel }}
          </UBadge>
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ viewModel.headline }}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ impactLabel }}</p>
          </div>
        </motion.div>
        <span
          v-if="autoRefreshActive"
          class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 shrink-0"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
          {{ t('raid.progress.auto_refresh_active') }}
        </span>
      </motion.div>

      <motion.div
        class="grid grid-cols-2 sm:grid-cols-4 gap-2"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :transition="{ delay: 0.1 }"
      >
        <div
          v-for="(metric, idx) in metrics"
          :key="metric.key"
          class="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 px-2.5 py-2"
        >
          <motion.p
            class="text-[10px] uppercase text-gray-400 font-semibold tracking-wide"
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :transition="{ delay: 0.12 + idx * 0.04 }"
          >
            {{ metric.label }}
          </motion.p>
          <motion.p
            class="text-sm font-semibold mt-0.5 truncate"
            :class="metric.class"
            :initial="{ opacity: 0, x: -4 }"
            :animate="{ opacity: 1, x: 0 }"
            :transition="{ delay: 0.14 + idx * 0.04 }"
          >
            {{ metric.value }}
          </motion.p>
        </div>
      </motion.div>
    </motion.div>
  </UCard>
</template>

<script setup lang="ts">
import type { RaidClusterHealthViewModel } from '~/types/raid'

const props = defineProps<{
  viewModel: RaidClusterHealthViewModel
  autoRefreshActive?: boolean
}>()

const { t } = useEsosI18n()

const healthColor = computed(() => {
  switch (props.viewModel.health) {
    case 'healthy': return 'green'
    case 'warning': return 'amber'
    case 'critical': return 'red'
    default: return 'gray'
  }
})

const healthLabel = computed(() => t(`raid.cockpit.health.${props.viewModel.health}`))

const impactLabel = computed(() => t(`raid.cockpit.impact.${props.viewModel.productionImpact}`))

const peerLabel = computed(() => {
  const s = props.viewModel.summary.peerConsistencyStatus
  return t(`raid.cockpit.peer_consistency.${s}`)
})

const resyncLabel = computed(() => {
  const s = props.viewModel.summary.resyncStatus
  return t(`raid.cockpit.resync.${s}`)
})

const metrics = computed(() => {
  const s = props.viewModel.summary
  const peerClass =
    s.peerConsistencyStatus === 'critical' ? 'text-red-600 dark:text-red-400'
      : s.peerConsistencyStatus === 'warning' ? 'text-amber-600 dark:text-amber-400'
        : s.peerConsistencyStatus === 'ok' ? 'text-green-600 dark:text-green-400'
          : 'text-gray-600 dark:text-gray-400'
  const resyncClass = s.resyncStatus === 'in_progress' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'
  return [
    {
      key: 'arrays',
      label: t('raid.cockpit.metric.active_arrays'),
      value: String(s.activeArraysCount),
      class: 'text-gray-900 dark:text-gray-100',
    },
    {
      key: 'nodes',
      label: t('raid.cockpit.metric.nodes'),
      value: s.totalNodes > 1 ? `${s.connectedNodes}/${s.totalNodes}` : '1',
      class: 'text-gray-900 dark:text-gray-100',
    },
    {
      key: 'peer',
      label: t('raid.cockpit.metric.peer_consistency'),
      value: peerLabel.value,
      class: peerClass,
    },
    {
      key: 'resync',
      label: t('raid.cockpit.metric.resync'),
      value: resyncLabel.value,
      class: resyncClass,
    },
  ]
})
</script>
