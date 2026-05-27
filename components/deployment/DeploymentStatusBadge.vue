<template>
  <UBadge :color="deploymentTargetBadgeColor(status)" size="xs">
    {{ label }}
  </UBadge>
</template>

<script setup lang="ts">
import type { DeploymentTargetStatus } from '~/types/deployment'
import { deploymentTargetBadgeColor } from '~/utils/deployment-ui'

const props = defineProps<{
  status: DeploymentTargetStatus | string
}>()

const { t } = useEsosI18n()

const label = computed(() => {
  const key = `admin.deployment.san.status_${props.status}` as const
  const translated = t(key)
  if (translated !== key) return translated as string
  return props.status
})
</script>
