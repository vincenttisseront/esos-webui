<template>
  <div class="space-y-2">
    <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
      {{ title }}
    </p>
    <div
      v-for="node in nodeResults"
      :key="node.sanId"
      class="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 space-y-2"
    >
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {{ node.label }}
            <span class="font-mono text-xs text-gray-500">({{ node.sanId }})</span>
          </p>
          <p v-if="node.arrayPath" class="text-xs text-gray-500 font-mono">{{ node.arrayPath }}</p>
          <p v-if="node.members.length" class="text-xs text-gray-500">
            {{ t('raid.cluster_md.members_label') }}: {{ node.members.join(', ') }}
          </p>
        </div>
        <UBadge
          :label="statusLabel(node.status)"
          :color="statusColor(node.status)"
          size="xs"
          variant="soft"
        />
      </div>
      <pre
        v-if="node.command"
        class="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3 max-h-48 overflow-auto font-mono text-gray-700 dark:text-gray-300"
      >{{ node.command }}</pre>
      <p v-if="node.error" class="text-xs text-red-600 dark:text-red-400">{{ node.error }}</p>
      <pre
        v-if="node.stdout && showOutput"
        class="text-xs text-gray-600 dark:text-gray-400 max-h-32 overflow-auto"
      >{{ node.stdout }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClusterMdNodeResult } from '~/types/raid'

defineProps<{
  title: string
  nodeResults: ClusterMdNodeResult[]
  showOutput?: boolean
}>()

const { t } = useEsosI18n()

function statusLabel(status: ClusterMdNodeResult['status']): string {
  return t(`raid.cluster_md.status.${status}`)
}

function statusColor(status: ClusterMdNodeResult['status']): 'green' | 'red' | 'amber' | 'gray' {
  if (status === 'success') return 'green'
  if (status === 'failed') return 'red'
  if (status === 'running') return 'amber'
  return 'gray'
}
</script>
