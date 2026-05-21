<template>
  <div
    class="rounded-xl border px-5 py-4 flex items-center gap-4"
    :class="{
      'bg-green-50 border-green-200':  overview.healthy && overview.mode !== 'split-brain',
      'bg-red-50 border-red-200':      overview.mode === 'degraded' || overview.mode === 'split-brain' || (!overview.healthy && overview.mode === 'degraded'),
      'bg-amber-50 border-amber-200':  overview.mode === 'unconfigured' || overview.mode === 'resyncing' || (!overview.healthy && overview.mode !== 'degraded' && overview.mode !== 'split-brain'),
    }"
  >
    <div
      class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
      :class="{
        'bg-green-100': overview.healthy,
        'bg-red-100':   !overview.healthy && overview.mode === 'degraded',
        'bg-amber-100': overview.mode === 'unconfigured' || (!overview.healthy && overview.mode !== 'degraded'),
      }"
    >
      <UIcon :name="statusIcon" class="w-5 h-5" :class="statusIconColor" />
    </div>

    <div class="flex-1">
      <p class="text-sm font-semibold" :class="statusTextColor">{{ statusLabel }}</p>
      <p class="text-xs mt-0.5" :class="statusSubColor">
        {{ t('cluster.status_banner.nodes_mode', { count: overview.nodes.length, mode: modeLabel }) }}
      </p>
    </div>

    <UButton
      v-if="overview.mode !== 'unconfigured' && syncNodeIds.length > 0"
      icon="i-heroicons-arrow-path"
      size="sm"
      color="gray"
      variant="outline"
      :label="t('cluster.status_banner.sync')"
      :loading="cluster.syncing"
      @click="cluster.sync(syncNodeIds)"
    />
  </div>
</template>

<script setup lang="ts">
import type { ClusterOverview } from '~/server/utils/types'

const props   = defineProps<{ overview: ClusterOverview }>()
const cluster = useClusterStore()
const { t }   = useEsosI18n()

const syncNodeIds = computed(() => props.overview.nodes.map(n => n.nodeId))

function clusterModeKey(mode: ClusterOverview['mode']): string {
  const map: Record<string, string> = {
    'active-passive': 'cluster.modes.active_passive',
    'active-active':  'cluster.modes.active_active',
    'unconfigured':   'cluster.modes.unconfigured',
    'degraded':       'cluster.modes.degraded',
    'resyncing':      'cluster.modes.resyncing',
    'split-brain':    'cluster.modes.split_brain',
  }
  return map[mode] ?? mode
}

const modeLabel = computed(() => t(clusterModeKey(props.overview.mode)))

const statusIcon = computed(() =>
  props.overview.healthy ? 'i-heroicons-check-circle' : 'i-heroicons-exclamation-circle',
)
const statusIconColor = computed(() =>
  props.overview.healthy ? 'text-green-600'
  : props.overview.mode === 'degraded' ? 'text-red-600'
  : 'text-amber-600',
)
const statusLabel = computed(() =>
  props.overview.healthy ? t('cluster.status_banner.operational')
  : props.overview.mode === 'unconfigured' ? t('cluster.status_banner.unconfigured')
  : t('cluster.status_banner.degraded'),
)
const statusTextColor = computed(() =>
  props.overview.healthy ? 'text-green-800'
  : props.overview.mode === 'degraded' ? 'text-red-800'
  : 'text-amber-800',
)
const statusSubColor = computed(() =>
  props.overview.healthy ? 'text-green-600'
  : props.overview.mode === 'degraded' ? 'text-red-600'
  : 'text-amber-600',
)
</script>
