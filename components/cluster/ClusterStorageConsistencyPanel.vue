<template>
  <UCard v-if="data">
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ t('cluster.storage.title') }}
        </h3>
        <UBadge :color="overallColor" variant="soft" size="xs">{{ t(`cluster.storage.overall.${data.overall}`) }}</UBadge>
      </div>
    </template>
    <p class="text-sm text-gray-600 dark:text-gray-400">{{ data.mdSummary }}</p>
    <ul v-if="data.mdArrays.length" class="mt-3 space-y-1.5 text-xs">
      <li
        v-for="arr in data.mdArrays"
        :key="arr.arrayName"
        class="flex items-center justify-between gap-2 rounded border border-gray-200 dark:border-gray-700 px-2 py-1.5"
      >
        <span class="font-mono font-medium">{{ arr.arrayName }}</span>
        <UBadge
          :color="arr.okSymmetric ? 'green' : arr.hardBlockers.length ? 'red' : 'amber'"
          size="xs"
          variant="soft"
        >
          {{ arr.okSymmetric ? t('cluster.storage.symmetric') : t('cluster.storage.asymmetric') }}
        </UBadge>
      </li>
    </ul>
    <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">{{ data.scst.summary }}</p>
  </UCard>
</template>

<script setup lang="ts">
import type { ClusterStorageConsistencyResult } from '~/types/cluster-admin'

const props = defineProps<{
  data: ClusterStorageConsistencyResult | null
}>()

const { t } = useEsosI18n()

const overallColor = computed(() => {
  switch (props.data?.overall) {
    case 'ok': return 'green'
    case 'warning': return 'amber'
    case 'critical': return 'red'
    default: return 'gray'
  }
})
</script>
