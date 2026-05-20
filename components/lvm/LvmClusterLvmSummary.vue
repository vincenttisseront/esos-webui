<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-medium">{{ t('lvm.cluster.view.summary_title') }}</h3>
        <UBadge :color="symmetryBadgeColor" variant="soft" size="xs" :label="symmetryLabel" />
      </div>
    </template>
    <div class="space-y-2 text-sm">
      <UAlert
        v-if="degraded"
        color="amber"
        variant="soft"
        size="sm"
        :title="t('lvm.cluster.view.inventory_degraded')"
      />
      <div class="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
        <span>PV {{ summaryCounts.pv }}</span>
        <span>VG {{ summaryCounts.vg }}</span>
        <span>LV {{ summaryCounts.lv }}</span>
        <span>SCST {{ summaryCounts.scst }}</span>
      </div>
      <p v-if="missingNodes.length" class="text-xs text-amber-700 dark:text-amber-300">
        {{ t('lvm.cluster.view.recommend.complete_node', { label: missingNodes.join(', ') }) }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="n in nodes"
          :key="n.sanId"
          :color="n.sshReady ? 'green' : 'gray'"
          variant="soft"
          size="xs"
          :label="`${n.label}: PV ${n.pvCount} VG ${n.vgCount} LV ${n.lvCount}`"
        />
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { ClusterLvmViewModel } from '~/utils/lvm-cluster-view-model'

const props = defineProps<{
  view: ClusterLvmViewModel
}>()

const { t } = useEsosI18n()

const degraded = computed(() => props.view.degraded)
const summaryCounts = computed(() => props.view.summaryCounts)
const nodes = computed(() => props.view.nodes)

const symmetryLabel = computed(() => {
  switch (props.view.symmetryStatus) {
    case 'ok': return t('lvm.cluster.view.symmetry_ok')
    case 'critical': return t('lvm.cluster.view.symmetry_critical')
    default: return t('lvm.cluster.view.symmetry_warning')
  }
})

const symmetryBadgeColor = computed(() => {
  switch (props.view.symmetryStatus) {
    case 'ok': return 'green'
    case 'critical': return 'red'
    default: return 'amber'
  }
})

const missingNodes = computed(() => {
  const labels = new Set<string>()
  for (const sp of props.view.stepProgress) {
    if (sp.ready < sp.total) {
      for (const l of sp.missingNodeLabels) labels.add(l)
    }
  }
  return [...labels]
})
</script>
