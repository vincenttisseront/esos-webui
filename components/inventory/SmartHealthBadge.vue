<template>
  <UBadge
    :color="colors[smart.health] ?? 'gray'"
    size="xs"
    variant="subtle"
  >
    {{ smart.health }}
  </UBadge>
</template>

<script setup lang="ts">
import type { SmartInfo } from '~/server/utils/types'

defineProps<{ smart: SmartInfo }>()

const colors: Record<string, string> = {
  PASSED:  'green',
  FAILED:  'red',
  UNKNOWN: 'gray',
}
</script>
