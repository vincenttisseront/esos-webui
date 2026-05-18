<template>
  <UBadge :color="config.color" size="xs" :class="config.class">
    {{ config.label }}
  </UBadge>
</template>

<script setup lang="ts">
import type { DRBDRole } from '~/server/utils/parsers/drbd.parser'

const props = defineProps<{ role: DRBDRole }>()

const config = computed(() => {
  switch (props.role) {
    case 'Primary':   return { color: 'violet', label: 'Primary',   class: '' }
    case 'Secondary': return { color: 'blue',   label: 'Secondary', class: '' }
    default:          return { color: 'gray',   label: 'Unknown',   class: '' }
  }
})
</script>
