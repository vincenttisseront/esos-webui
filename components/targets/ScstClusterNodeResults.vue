<template>
  <div v-if="nodeResults?.length" class="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 p-4 space-y-2">
    <p class="text-sm font-semibold text-amber-900 dark:text-amber-100">
      {{ t('storage.hosts.clusterResults.title') }}
    </p>
    <ul class="text-sm space-y-1">
      <li
        v-for="node in nodeResults"
        :key="node.sanId"
        class="flex items-center justify-between gap-2"
      >
        <span class="font-medium">{{ node.label }}</span>
        <UBadge
          :color="node.participation === 'execute' ? 'green' : 'red'"
          variant="soft"
          size="xs"
          :label="node.participation === 'execute'
            ? t('storage.hosts.clusterResults.ok')
            : t('storage.hosts.clusterResults.failed')"
        />
        <span v-if="node.error" class="text-xs text-red-600 dark:text-red-400 truncate max-w-xs">
          {{ node.error }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { ClusterLvmNodeResult } from '~/types/lvm'

const { t } = useEsosI18n()
defineProps<{ nodeResults: ClusterLvmNodeResult[] | null }>()
</script>
