<template>
  <motion.div
    class="space-y-2"
    :initial="{ opacity: 0, y: 6 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="{ duration: 0.2 }"
  >
    <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
      {{ title }}
    </p>
    <div class="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
      <table class="min-w-full text-xs">
        <thead class="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
          <tr>
            <th class="px-2 py-1.5 text-left font-medium">{{ t('raid.cluster_md.recovery.col_node') }}</th>
            <th v-if="showRecoveryColumns" class="px-2 py-1.5 text-left font-medium">{{ t('raid.cluster_md.recovery.col_state') }}</th>
            <th v-if="showRecoveryColumns" class="px-2 py-1.5 text-left font-medium">{{ t('raid.cluster_md.recovery.col_participation') }}</th>
            <th class="px-2 py-1.5 text-left font-medium">{{ t('raid.cluster_md.recovery.col_status') }}</th>
            <th class="px-2 py-1.5 text-left font-medium">{{ t('raid.cluster_md.recovery.col_command') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="node in nodeResults"
            :key="node.sanId"
            class="border-t border-gray-200 dark:border-gray-700"
          >
            <td class="px-2 py-2 align-top">
              <p class="font-semibold text-gray-800 dark:text-gray-200">{{ node.label }}</p>
              <p v-if="node.arrayPath" class="font-mono text-gray-500">{{ node.arrayPath }}</p>
              <p v-if="node.members.length" class="text-gray-500">
                {{ t('raid.cluster_md.members_label') }}: {{ node.members.join(', ') }}
              </p>
            </td>
            <td v-if="showRecoveryColumns" class="px-2 py-2 align-top">
              <UBadge
                v-if="node.nodeState"
                :label="t(`raid.cluster_md.recovery.node_state.${node.nodeState}`)"
                :color="stateColor(node.nodeState)"
                size="xs"
                variant="soft"
              />
            </td>
            <td v-if="showRecoveryColumns" class="px-2 py-2 align-top text-gray-600 dark:text-gray-400">
              <span v-if="node.participation">{{ t(`raid.cluster_md.recovery.participation.${node.participation}`) }}</span>
              <p v-if="node.skipReason" class="text-gray-500 mt-0.5">{{ node.skipReason }}</p>
            </td>
            <td class="px-2 py-2 align-top">
              <UBadge
                :label="statusLabel(node.status)"
                :color="statusColor(node.status)"
                size="xs"
                variant="soft"
              />
              <p v-if="node.error" class="text-red-600 dark:text-red-400 mt-1">{{ node.error }}</p>
            </td>
            <td class="px-2 py-2 align-top">
              <pre
                v-if="node.command"
                class="text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
              >{{ node.command }}</pre>
              <pre
                v-if="node.stdout && showOutput"
                class="text-xs text-gray-600 dark:text-gray-400 mt-1 max-h-24 overflow-auto whitespace-pre-wrap"
              >{{ node.stdout }}</pre>
            </td>
          </tr>
        </tbody>
      </table>
    </motion.div>
  </motion.div>
</template>

<script setup lang="ts">
import type { ClusterMdNodeResult, MdArrayNodeState } from '~/types/raid'

const props = defineProps<{
  title: string
  nodeResults: ClusterMdNodeResult[]
  showOutput?: boolean
  showRecoveryColumns?: boolean
}>()

const { t } = useEsosI18n()

const showRecoveryColumns = computed(() =>
  props.showRecoveryColumns ?? props.nodeResults.some(n => n.nodeState || n.participation),
)

function statusLabel(status: ClusterMdNodeResult['status']): string {
  return t(`raid.cluster_md.status.${status}`)
}

function statusColor(status: ClusterMdNodeResult['status']): 'green' | 'red' | 'amber' | 'gray' {
  if (status === 'success') return 'green'
  if (status === 'failed') return 'red'
  if (status === 'running') return 'amber'
  if (status === 'skipped') return 'gray'
  return 'gray'
}

function stateColor(state: MdArrayNodeState): 'green' | 'red' | 'amber' | 'gray' | 'blue' {
  if (state === 'active') return 'green'
  if (state === 'unreachable' || state === 'error') return 'red'
  if (state === 'stopped' || state === 'metadata_only') return 'amber'
  return 'gray'
}
</script>
