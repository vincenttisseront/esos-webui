<template>
  <UBadge :color="color" :label="label" variant="soft" />
</template>

<script setup lang="ts">
import type { RaidHealth } from '~/types/raid'

const props = defineProps<{ health: RaidHealth }>()

const color = computed(() => ({
  ok: 'green',
  warning: 'amber',
  critical: 'red',
  rebuilding: 'blue',
  unknown: 'gray',
}[props.health] ?? 'gray'))

const label = computed(() => ({
  ok: 'OK',
  warning: 'Avertissement',
  critical: 'Critique',
  rebuilding: 'Rebuild',
  unknown: 'Inconnu',
}[props.health] ?? 'Inconnu'))
</script>
