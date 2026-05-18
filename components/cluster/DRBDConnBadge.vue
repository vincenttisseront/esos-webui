<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium"
    :class="config.class"
  >
    <span v-if="config.pulse" class="w-1.5 h-1.5 rounded-full animate-pulse" :class="config.dotClass" />
    {{ config.label }}
  </span>
</template>

<script setup lang="ts">
import type { DRBDConnState } from '~/server/utils/parsers/drbd.parser'

const props = defineProps<{ state: DRBDConnState }>()

const config = computed(() => {
  switch (props.state) {
    case 'Connected':
    case 'Established':
      return { label: props.state,    class: 'bg-green-50 text-green-700',          pulse: false, dotClass: '' }
    case 'SyncSource':
    case 'SyncTarget':
      return { label: props.state,    class: 'bg-blue-50 text-blue-700',            pulse: true,  dotClass: 'bg-blue-500' }
    case 'PausedSyncS':
    case 'PausedSyncT':
      return { label: props.state,    class: 'bg-amber-50 text-amber-700',          pulse: false, dotClass: '' }
    case 'VerifyS':
    case 'VerifyT':
      return { label: props.state,    class: 'bg-blue-50 text-blue-600',            pulse: true,  dotClass: 'bg-blue-400' }
    case 'Connecting':
      return { label: 'Connecting',   class: 'bg-amber-50 text-amber-700',          pulse: true,  dotClass: 'bg-amber-500' }
    case 'Disconnected':
      return { label: 'Disconnected', class: 'bg-red-50 text-red-600',              pulse: false, dotClass: '' }
    case 'Unconnected':
      return { label: 'Unconnected',  class: 'bg-red-50 text-red-600',              pulse: false, dotClass: '' }
    case 'StandAlone':
      return { label: '⚠ Split-Brain',class: 'bg-red-100 text-red-700 font-bold',  pulse: true,  dotClass: 'bg-red-600' }
    default:
      return { label: 'Unknown',      class: 'bg-gray-100 text-gray-500',           pulse: false, dotClass: '' }
  }
})
</script>
