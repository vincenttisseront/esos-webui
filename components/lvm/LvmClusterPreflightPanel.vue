<template>
  <div class="space-y-2 text-sm">
    <UAlert v-if="!preflight.ok" color="red" variant="soft" :title="t('lvm.cluster.wizard.preflight_failed')" />
    <UAlert v-else color="green" variant="soft" :title="t('lvm.cluster.wizard.preflight_ok')" />
    <ul v-if="preflight.blockers.length" class="text-red-600 dark:text-red-400 space-y-0.5 list-disc pl-4">
      <li v-for="(b, i) in preflight.blockers" :key="i">{{ b }}</li>
    </ul>
    <ul v-if="preflight.warnings.length" class="text-amber-600 dark:text-amber-400 space-y-0.5 list-disc pl-4">
      <li v-for="(w, i) in preflight.warnings" :key="i">{{ w }}</li>
    </ul>
    <div v-if="preflight.mappings.length" class="text-xs text-gray-500">
      <p class="font-medium text-gray-700 dark:text-gray-300 mb-1">{{ t('lvm.cluster.wizard.mappings_title') }}</p>
      <div v-for="m in preflight.mappings" :key="`${m.peerSanId}-${m.sourcePath}`" class="font-mono">
        {{ nodeLabel(m.peerSanId) }} : {{ m.sourcePath }} → {{ m.peerPath }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClusterLvmPreflightResult } from '~/types/lvm'

const props = defineProps<{
  preflight: ClusterLvmPreflightResult
  nodeLabelById?: Record<string, string>
}>()
const { t } = useEsosI18n()

function nodeLabel(sanId: string) {
  return props.nodeLabelById?.[sanId]
    ?? props.preflight.nodes.find(n => n.sanId === sanId)?.label
    ?? sanId
}
</script>
