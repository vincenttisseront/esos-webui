<template>
  <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-3 py-2.5 space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
        {{ t('raid.software.summary.title') }}
      </span>
      <span
        v-if="autoRefreshActive"
        class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"
      >
        <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
        {{ t('raid.progress.auto_refresh_active') }}
      </span>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button
        v-if="counts.active > 0"
        type="button"
        class="text-xs rounded-full px-2.5 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 hover:ring-1 ring-green-300"
        @click="$emit('navigate', 'software-active')"
      >
        {{ t('raid.software.summary.active', { count: counts.active }) }}
      </button>
      <button
        v-if="counts.rebuilding > 0"
        type="button"
        class="text-xs rounded-full px-2.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 hover:ring-1 ring-amber-300"
        @click="$emit('navigate', 'software-active')"
      >
        {{ t('raid.software.summary.rebuilding', { count: counts.rebuilding }) }}
      </button>
      <button
        v-if="counts.stoppedAssemblable > 0"
        type="button"
        class="text-xs rounded-full px-2.5 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 hover:ring-1 ring-blue-300"
        @click="$emit('navigate', 'software-stopped-assemblable')"
      >
        {{ t('raid.software.summary.stopped', { count: counts.stoppedAssemblable }) }}
      </button>
      <button
        v-if="counts.orphan > 0"
        type="button"
        class="text-xs rounded-full px-2.5 py-0.5 bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 hover:ring-1 ring-orange-300"
        @click="$emit('navigate', 'software-stopped-orphan')"
      >
        {{ t('raid.software.summary.orphan', { count: counts.orphan }) }}
      </button>
      <button
        v-if="counts.peerMd > 0"
        type="button"
        class="text-xs rounded-full px-2.5 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 hover:ring-1 ring-purple-300"
        @click="$emit('navigate', 'software-peer')"
      >
        {{ t('raid.software.summary.peer_md', { count: counts.peerMd }) }}
      </button>
    </div>

    <p v-if="resyncLine" class="text-xs text-amber-700 dark:text-amber-300 font-mono">
      {{ resyncLine }}
    </p>
    <p v-else-if="counts.active > 0 && counts.rebuilding === 0" class="text-xs text-gray-500 dark:text-gray-400">
      {{ t('raid.software.summary.no_resync') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { PrimaryResyncSummary } from '~/utils/raid-md-progress'

export type RaidSoftwareSummaryAnchor =
  | 'software-active'
  | 'software-stopped-assemblable'
  | 'software-stopped-orphan'
  | 'software-peer'

const props = defineProps<{
  counts: {
    active: number
    rebuilding: number
    stoppedAssemblable: number
    orphan: number
    peerMd: number
  }
  resync?: PrimaryResyncSummary | null
  autoRefreshActive?: boolean
}>()

defineEmits<{
  navigate: [anchor: RaidSoftwareSummaryAnchor]
}>()

const { t } = useEsosI18n()

const resyncLine = computed(() => {
  const r = props.resync
  if (!r) return null
  return t('raid.software.summary.resync_line', {
    path: r.path,
    action: r.action,
    percent: r.percent.toFixed(1),
    speed: r.speedMbps != null ? `${r.speedMbps.toFixed(0)} MB/s` : '—',
    eta: r.eta ?? '—',
  })
})
</script>
