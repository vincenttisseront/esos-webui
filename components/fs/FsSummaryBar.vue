<template>
  <div class="space-y-1.5">
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

    <div
      v-if="showProvisioningTracks"
      class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400 px-1"
    >
      <span>
        <span class="font-medium text-gray-800 dark:text-gray-200">{{ t('storage.fs.summary.block_provisioning') }}:</span>
        {{ blockProvisioningComplete ? t('storage.fs.summary.block_complete') : t('storage.fs.summary.block_incomplete') }}
      </span>
      <span>
        <span class="font-medium text-gray-800 dark:text-gray-200">{{ t('storage.fs.summary.fileio_track') }}:</span>
        {{
          fileioTrackConfigured
            ? t('storage.fs.summary.fileio_configured')
            : t('storage.fs.summary.fileio_optional_not_configured')
        }}
      </span>
    </div>

    <p v-if="nextActionHint" class="text-xs text-primary-600 dark:text-primary-400">
      {{ nextActionHint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FsFileioDetectionCounts } from '~/utils/fs-fileio-view'
import type { FsSummaryStatus } from '~/utils/fs-summary-status'

const props = defineProps<{
  counts: FsFileioDetectionCounts
  status: FsSummaryStatus
  scannedAtLabel?: string
  nextActionHint?: string
  refreshing?: boolean
  blockProvisioningComplete?: boolean
  fileioTrackConfigured?: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()
const { t } = useEsosI18n()

const showProvisioningTracks = computed(() =>
  props.blockProvisioningComplete !== undefined
  || props.fileioTrackConfigured !== undefined,
)
</script>
