<template>
  <UCard>
    <motion.div
      class="space-y-3"
      :initial="{ opacity: 0, y: 4 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.2 }"
    >
      <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
        {{ t('raid.cockpit.status.title') }}
      </h2>

      <div class="flex flex-wrap items-center gap-3">
        <UBadge
          :color="healthColor"
          variant="solid"
          size="lg"
          class="text-base font-semibold px-4 py-1.5"
        >
          {{ healthBadgeLabel }}
        </UBadge>
        <span
          v-if="autoRefreshActive"
          class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
          {{ t('raid.progress.auto_refresh_active') }}
        </span>
      </div>

      <p class="text-sm text-gray-800 dark:text-gray-200">
        {{ viewModel.headline }}
      </p>

      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ factsLine }}
      </p>
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

const healthBadgeLabel = computed(() => {
  const h = props.viewModel.health
  if (h === 'warning') return t('raid.cockpit.health.warning_long')
  return t(`raid.cockpit.health.${h}`)
})

const factsLine = computed(() => {
  const s = props.viewModel.summary
  const nodes = s.totalNodes > 1 ? `${s.connectedNodes}/${s.totalNodes}` : '1'
  const redundancy = t(`raid.cockpit.redundancy.${s.peerConsistencyStatus}`)
  const resync = t(`raid.cockpit.resync.${s.resyncStatus}`)
  return t('raid.cockpit.facts_line', {
    arrays: String(s.activeArraysCount),
    nodes,
    redundancy,
    resync,
  })
})
</script>
