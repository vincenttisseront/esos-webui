<template>
  <div class="space-y-2">
    <UAlert
      :color="result.success ? 'green' : 'red'"
      variant="soft"
      :title="result.success ? t('lvm.cluster.wizard.results_ok') : t('lvm.cluster.wizard.results_partial')"
    />
    <div class="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-left text-gray-500 border-b bg-gray-50 dark:bg-gray-900">
            <th class="py-2 px-2">{{ t('lvm.cluster.wizard.node') }}</th>
            <th class="py-2 px-2">{{ t('lvm.cluster.wizard.result_status') }}</th>
            <th class="py-2 px-2">{{ t('lvm.cluster.wizard.command') }}</th>
            <th class="py-2 px-2">{{ t('lvm.cluster.wizard.exit_code') }}</th>
            <th class="py-2 px-2">{{ t('lvm.cluster.wizard.result_detail') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in result.nodeResults" :key="row.sanId" class="border-b border-gray-100 dark:border-gray-800">
            <td class="py-2 px-2 font-medium">{{ row.label }}</td>
            <td class="py-2 px-2">
              <UBadge
                :color="row.participation === 'execute' && !row.error ? 'green' : row.participation === 'failed' ? 'red' : 'gray'"
                size="xs"
                :label="statusLabel(row)"
              />
            </td>
            <td class="py-2 px-2 font-mono text-gray-600 dark:text-gray-400">{{ row.command ?? '—' }}</td>
            <td class="py-2 px-2 font-mono">{{ row.exitCode ?? '—' }}</td>
            <td class="py-2 px-2 text-gray-600 dark:text-gray-400 max-w-xs truncate" :title="detail(row)">
              {{ detail(row) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ul v-if="result.errors.length" class="text-red-600 text-xs list-disc pl-4">
      <li v-for="(e, i) in result.errors" :key="i">{{ e }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { ClusterLvmExecutionResult, ClusterLvmNodeResult } from '~/types/lvm'

defineProps<{ result: ClusterLvmExecutionResult }>()
const { t } = useEsosI18n()

function statusLabel(row: ClusterLvmNodeResult) {
  if (row.participation === 'failed' || row.error || (row.exitCode != null && row.exitCode !== 0)) {
    return t('lvm.cluster.wizard.result_failed')
  }
  if (row.participation === 'execute') return t('lvm.cluster.wizard.result_success')
  return t('lvm.cluster.wizard.node_skipped')
}

function detail(row: ClusterLvmNodeResult) {
  return row.error ?? row.stderr?.trim() ?? row.stdout?.trim() ?? '—'
}
</script>
