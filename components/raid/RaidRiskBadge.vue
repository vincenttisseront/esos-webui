<template>
  <UBadge :color="color" :label="label" variant="soft" />
</template>

<script setup lang="ts">
import type { RaidRiskLevel } from '~/types/raid'

const props = defineProps<{ risk: RaidRiskLevel }>()

const color = computed(() => ({
  read_only: 'gray',
  safe: 'green',
  risky: 'amber',
  destructive: 'red',
}[props.risk] ?? 'gray'))

const label = computed(() => ({
  read_only: 'Lecture seule',
  safe: 'Sûr',
  risky: 'Risqué',
  destructive: 'Destructif',
}[props.risk] ?? props.risk))
</script>
