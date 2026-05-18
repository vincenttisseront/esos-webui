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
import type { DRBDDiskState } from '~/server/utils/parsers/drbd.parser'

const props = defineProps<{ state: DRBDDiskState }>()

const config = computed(() => {
  switch (props.state) {
    case 'UpToDate':
      return { label: 'UpToDate',     class: 'bg-green-50 text-green-700',    pulse: false, dotClass: '' }
    case 'Inconsistent':
      return { label: 'Inconsistent', class: 'bg-amber-50 text-amber-700',    pulse: true,  dotClass: 'bg-amber-500' }
    case 'Outdated':
      return { label: 'Outdated',     class: 'bg-orange-50 text-orange-700',  pulse: false, dotClass: '' }
    case 'Diskless':
      return { label: 'Diskless',     class: 'bg-red-50 text-red-600',        pulse: false, dotClass: '' }
    case 'Failed':
      return { label: 'Failed',       class: 'bg-red-100 text-red-700',       pulse: true,  dotClass: 'bg-red-600' }
    case 'Negotiating':
      return { label: 'Negotiating',  class: 'bg-amber-50 text-amber-700',    pulse: true,  dotClass: 'bg-amber-500' }
    default:
      return { label: 'DUnknown',     class: 'bg-gray-100 text-gray-500',     pulse: false, dotClass: '' }
  }
})
</script>
