<template>
  <UBadge :color="color" :label="label" size="sm" />
</template>

<script setup lang="ts">
import type { PerfAgentServiceStatus } from '~/server/utils/perf-agent-types'

const props = defineProps<{
  service: PerfAgentServiceStatus | null
}>()

const color = computed(() => {
  if (!props.service) return 'gray'
  if (props.service.running) return 'green'
  if (props.service.enabledOnBoot) return 'orange'
  return 'gray'
})

const label = computed(() => {
  if (!props.service) return 'Inconnu'
  if (props.service.running) return 'Running'
  if (props.service.enabledOnBoot) return 'Stopped (auto-démarrage actif)'
  return 'Stopped'
})
</script>
