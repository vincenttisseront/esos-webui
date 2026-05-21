<template>
  <UCard v-if="model">
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div class="space-y-1 min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :color="model.severity === 'critical' ? 'red' : 'amber'"
            variant="solid"
            size="sm"
            :label="model.severity === 'critical' ? t('raid.page_health.critical') : t('raid.page_health.warning')"
          />
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
            {{ t('raid.overview.cluster_alert.title', { cluster: model.clusterName }) }}
          </span>
        </div>
        <p class="text-sm text-gray-700 dark:text-gray-300">
          {{ model.reason }}
        </p>
        <p v-if="model.affectedNodeLabels.length" class="text-xs text-gray-500">
          {{ t('raid.overview.cluster_alert.nodes', { nodes: model.affectedNodeLabels.join(', ') }) }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2 shrink-0">
        <UButton
          size="xs"
          color="primary"
          variant="soft"
          icon="i-heroicons-rectangle-group"
          :to="`/admin/cluster?clusterId=${model.clusterId}`"
        >
          {{ t('raid.overview.cluster_alert.open_cluster') }}
        </UButton>
        <UButton
          v-if="peerSanId"
          size="xs"
          color="gray"
          variant="ghost"
          icon="i-heroicons-server"
          :to="`/admin/sans/${peerSanId}/raid`"
        >
          {{ t('raid.overview.cluster_alert.open_peer_raid') }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { ClusterRaidAlertCardModel } from '~/utils/cluster-raid-page-health'

const props = defineProps<{
  model: ClusterRaidAlertCardModel | null
}>()

const { t } = useEsosI18n()

const peerSanId = computed(() => props.model?.peerSanId ?? null)
</script>
