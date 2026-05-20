<template>
  <div
    class="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
    :class="stripClass"
  >
    <UBadge :color="healthColor" variant="solid" size="md" class="font-semibold shrink-0">
      {{ healthLabel }}
    </UBadge>
    <div class="min-w-0 flex-1 space-y-0.5">
      <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
        {{ viewModel.headline }}
      </p>
      <p v-if="showSplitHealth" class="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
        <span>{{ t('raid.cockpit.status.local_label') }} : {{ localHealthLabel }}</span>
        <span>{{ t('raid.cockpit.status.cluster_label') }} : {{ clusterHealthLabel }}</span>
      </p>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{ factsLine }}
      </p>
      <p
        v-if="viewModel.storageFactsHint"
        class="text-xs text-amber-700 dark:text-amber-400"
      >
        {{ viewModel.storageFactsHint }}
      </p>
    </div>
    <span
      v-if="autoRefreshActive"
      class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 shrink-0"
    >
      <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      {{ t('raid.progress.auto_refresh_active') }}
    </span>
  </div>
</template>

<script setup lang="ts">
import type { RaidClusterHealthViewModel, RaidCockpitHealth } from '~/types/raid'

const props = defineProps<{
  viewModel: RaidClusterHealthViewModel
  isClustered?: boolean
  autoRefreshActive?: boolean
}>()

const { t } = useEsosI18n()

const showSplitHealth = computed(() =>
  props.isClustered
  && (props.viewModel.localHealth !== props.viewModel.clusterHealth
    || props.viewModel.clusterHealth !== 'healthy'),
)

function healthColorFor(h: RaidCockpitHealth) {
  switch (h) {
    case 'healthy': return 'green'
    case 'warning': return 'amber'
    case 'critical': return 'red'
    default: return 'gray'
  }
}

function healthLabelFor(h: RaidCockpitHealth) {
  if (h === 'warning') return t('raid.cockpit.health.warning_long')
  return t(`raid.cockpit.health.${h}`)
}

const healthColor = computed(() => healthColorFor(props.viewModel.health))

const healthLabel = computed(() => healthLabelFor(props.viewModel.health))

const localHealthLabel = computed(() => healthLabelFor(props.viewModel.localHealth))

const clusterHealthLabel = computed(() => healthLabelFor(props.viewModel.clusterHealth))

const factsLine = computed(() => {
  const s = props.viewModel.summary
  const nodes = s.totalNodes > 1 ? `${s.connectedNodes}/${s.totalNodes}` : '1'
  return t('raid.cockpit.facts_line', {
    arrays: String(s.activeArraysCount),
    nodes,
    redundancy: t(`raid.cockpit.redundancy.${s.peerConsistencyStatus}`),
    resync: t(`raid.cockpit.resync.${s.resyncStatus}`),
  })
})

const stripClass = computed(() => {
  switch (props.viewModel.health) {
    case 'critical':
      return 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20'
    case 'warning':
      return 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/15'
    case 'healthy':
      return 'border-green-200 dark:border-green-900/40 bg-green-50/30 dark:bg-green-950/10'
    default:
      return 'border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/30'
  }
})
</script>
