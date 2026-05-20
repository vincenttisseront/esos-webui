<template>
  <div class="space-y-2">
    <p v-if="plan.warnings.length" class="text-xs text-amber-600 dark:text-amber-400">
      {{ plan.warnings.join(' · ') }}
    </p>
    <UAlert v-if="plan.blockers.length" color="red" variant="soft" :title="plan.blockers.join(' · ')" />
    <div class="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-left text-gray-500 border-b bg-gray-50 dark:bg-gray-900">
            <th class="py-2 px-2">{{ t('lvm.cluster.wizard.node') }}</th>
            <th class="py-2 px-2">{{ t('lvm.cluster.wizard.participation') }}</th>
            <th class="py-2 px-2">{{ t('lvm.cluster.wizard.command') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in plan.nodeResults" :key="row.sanId" class="border-b border-gray-100 dark:border-gray-800">
            <td class="py-2 px-2 font-medium">{{ row.label }}</td>
            <td class="py-2 px-2">
              <UBadge
                :color="row.participation === 'execute' ? 'green' : 'gray'"
                size="xs"
                :label="participationLabel(row.participation)"
              />
              <span v-if="row.error" class="block text-red-600 mt-0.5">{{ row.error }}</span>
            </td>
            <td class="py-2 px-2 font-mono text-gray-600 dark:text-gray-400">{{ row.command ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClusterLvmExecutionPlan } from '~/types/lvm'

defineProps<{ plan: ClusterLvmExecutionPlan }>()
const { t } = useEsosI18n()

function participationLabel(p: string) {
  if (p === 'execute') return t('lvm.cluster.wizard.execute_all')
  return t('lvm.cluster.wizard.node_skipped')
}
</script>
