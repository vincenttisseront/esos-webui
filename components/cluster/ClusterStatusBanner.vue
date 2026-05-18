<template>
  <div
    class="rounded-xl border px-5 py-4 flex items-center gap-4"
    :class="{
      'bg-green-50 border-green-200':  overview.healthy,
      'bg-red-50 border-red-200':      !overview.healthy && overview.mode === 'degraded',
      'bg-amber-50 border-amber-200':  overview.mode === 'unconfigured' || (!overview.healthy && overview.mode !== 'degraded'),
    }"
  >
    <!-- Icône état -->
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

    <!-- Infos -->
    <div class="flex-1">
      <p class="text-sm font-semibold" :class="statusTextColor">{{ statusLabel }}</p>
      <p class="text-xs mt-0.5" :class="statusSubColor">
        {{ overview.nodes.length }} nœud(s) · Mode : {{ modeLabelMap[overview.mode] }}
      </p>
    </div>

    <!-- Bouton sync -->
    <UButton
      v-if="overview.mode !== 'unconfigured' && syncNodeIds.length > 0"
      icon="i-heroicons-arrow-path"
      size="sm"
      color="gray"
      variant="outline"
      label="Synchroniser"
      :loading="cluster.syncing"
      @click="cluster.sync(syncNodeIds)"
    />
  </div>
</template>

<script setup lang="ts">
import type { ClusterOverview } from '~/server/utils/types'

const props   = defineProps<{ overview: ClusterOverview }>()
const cluster = useClusterStore()

const syncNodeIds = computed(() => props.overview.nodes.map(n => n.nodeId))

const modeLabelMap: Record<ClusterOverview['mode'], string> = {
  'active-passive': 'Active/Passive',
  'active-active':  'Active/Active',
  'unconfigured':   'Non configuré',
  'degraded':       'Dégradé',
}

const statusIcon = computed(() =>
  props.overview.healthy ? 'i-heroicons-check-circle' : 'i-heroicons-exclamation-circle',
)
const statusIconColor = computed(() =>
  props.overview.healthy ? 'text-green-600'
  : props.overview.mode === 'degraded' ? 'text-red-600'
  : 'text-amber-600',
)
const statusLabel = computed(() =>
  props.overview.healthy ? 'Cluster opérationnel'
  : props.overview.mode === 'unconfigured' ? 'Cluster non configuré'
  : 'Cluster dégradé ou hors ligne',
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
