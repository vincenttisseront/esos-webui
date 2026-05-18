<template>
  <span class="text-xs font-medium px-2 py-0.5 rounded-full" :class="cls">
    {{ role }}
  </span>
</template>

<script setup lang="ts">
import type { ResourceState } from '~/server/utils/types'

const props = defineProps<{ role: ResourceState }>()

const MAP: Record<ResourceState, string> = {
  Started: 'bg-green-100 text-green-700',
  Stopped: 'bg-gray-100 text-gray-400',
  Master:  'bg-purple-100 text-purple-700',
  Slave:   'bg-blue-100 text-blue-600',
  Unknown: 'bg-amber-100 text-amber-600',
}

const cls = computed(() => MAP[props.role] ?? MAP.Unknown)
</script>
