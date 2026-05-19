<template>
  <div v-if="action" class="flex flex-wrap items-center gap-2 text-xs">
    <span class="text-gray-500">{{ t('raid.stopped_md.recommended_label') }}:</span>
    <UBadge color="amber" variant="soft" size="xs" :label="actionLabel" />
  </div>
</template>

<script setup lang="ts">
import type { StoppedMdArray } from '~/types/raid'
import { primaryRecommendedActionForStoppedArray } from '~/utils/stopped-md'

const props = defineProps<{
  array: StoppedMdArray
}>()

const { t } = useEsosI18n()

const action = computed(() => primaryRecommendedActionForStoppedArray(props.array))

const actionLabel = computed(() => {
  if (!action.value) return ''
  return t(`raid.stopped_md.recommended.${action.value}`)
})
</script>
