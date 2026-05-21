<template>
  <div
    class="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2"
  >
    <div class="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
      <span class="font-medium text-gray-800 dark:text-gray-200">{{ t('storage.fs.summary.counts_label') }}</span>
      <span>{{ t('storage.fs.summary.count_filesystems', { n: counts.filesystems }) }}</span>
      <span class="text-gray-300">·</span>
      <span>{{ t('storage.fs.summary.count_vdisks', { n: counts.vdiskFiles }) }}</span>
      <span class="text-gray-300">·</span>
      <span>{{ t('storage.fs.summary.count_fileio', { n: counts.fileioDevices }) }}</span>
      <span class="text-gray-300">·</span>
      <span>{{ t('storage.fs.summary.count_luns', { n: counts.lunMappings }) }}</span>
    </div>

    <UBadge
      :color="status === 'ok' ? 'green' : 'amber'"
      variant="soft"
      size="sm"
      :label="status === 'ok' ? t('storage.fs.summary.status_ok') : t('storage.fs.summary.status_attention')"
    />

    <span v-if="scannedAtLabel" class="text-xs text-gray-500 dark:text-gray-400 ml-auto">
      {{ t('storage.fs.summary.last_scan', { time: scannedAtLabel }) }}
    </span>

    <UButton
      size="xs"
      color="gray"
      variant="ghost"
      icon="i-heroicons-arrow-path"
      :loading="refreshing"
      @click="emit('refresh')"
    >
      {{ t('storage.fs.overview.refresh') }}
    </UButton>
  </div>
  <p v-if="nextActionHint" class="text-xs text-primary-600 dark:text-primary-400 -mt-2">
    {{ nextActionHint }}
  </p>
</template>

<script setup lang="ts">
import type { FsFileioDetectionCounts } from '~/utils/fs-fileio-view'
import type { FsSummaryStatus } from '~/utils/fs-summary-status'

defineProps<{
  counts: FsFileioDetectionCounts
  status: FsSummaryStatus
  scannedAtLabel?: string
  nextActionHint?: string
  refreshing?: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()
const { t } = useEsosI18n()
</script>
