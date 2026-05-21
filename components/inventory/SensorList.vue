<template>
  <ul class="space-y-1">
    <li
      v-for="s in sensors"
      :key="s.name"
      class="flex items-center justify-between text-xs"
    >
      <span class="text-gray-600 dark:text-gray-400 truncate">{{ s.name }}</span>
      <span :class="stateClass(s.state)" class="font-mono ml-2 shrink-0">
        {{ s.value }} {{ s.unit }}
      </span>
    </li>
    <li v-if="!sensors.length" class="text-xs text-gray-300 italic">Aucune donnée</li>
  </ul>
</template>

<script setup lang="ts">
import type { IPMISensor } from '~/server/utils/types'

defineProps<{ sensors: IPMISensor[] }>()

function stateClass(s: IPMISensor['state']) {
  return {
    ok:       'text-gray-700',
    warning:  'text-amber-600 font-bold',
    critical: 'text-red-600 font-bold',
    unknown:  'text-gray-400',
  }[s] ?? 'text-gray-400'
}
</script>
