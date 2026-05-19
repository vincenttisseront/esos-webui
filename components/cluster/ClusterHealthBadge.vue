<template>
  <UBadge :color="badgeColor" variant="soft" size="xs">
    {{ label }}
  </UBadge>
</template>

<script setup lang="ts">
import type { ClusterHealth } from '~/types/cluster-admin'

const props = defineProps<{
  health: ClusterHealth | undefined
}>()

const { t } = useEsosI18n()

const badgeColor = computed(() => {
  switch (props.health) {
    case 'healthy': return 'green'
    case 'warning': return 'amber'
    case 'critical': return 'red'
    default: return 'gray'
  }
})

const label = computed(() => {
  if (!props.health) return t('cluster.health.unknown')
  return t(`cluster.health.${props.health}`)
})
</script>
