<template>
  <div
    v-if="visiblePoints.length"
    class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2.5 space-y-2"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
        {{ t('cluster.attention.title') }}
      </p>
      <span v-if="totalCount > maxVisible" class="text-xs text-amber-700 dark:text-amber-400">
        {{ t('cluster.attention.show_all', { count: totalCount }) }}
      </span>
    </div>
    <ul class="space-y-2">
      <li
        v-for="point in visiblePoints"
        :key="point.id"
        class="flex flex-wrap items-start justify-between gap-2 text-xs"
      >
        <div class="min-w-0 flex-1">
          <span class="font-medium text-amber-900 dark:text-amber-100">{{ point.title }}</span>
          <span class="text-gray-600 dark:text-gray-400"> — {{ point.summary }}</span>
        </div>
        <UButton
          v-if="actionLabel(point)"
          size="xs"
          :color="point.severity === 'critical' || point.severity === 'blocking' ? 'red' : 'amber'"
          variant="soft"
          @click="$emit('action', point)"
        >
          {{ actionLabel(point) }}
        </UButton>
      </li>
    </ul>
    <details v-if="totalCount > maxVisible" class="text-xs">
      <summary class="cursor-pointer text-amber-800 dark:text-amber-300 py-1">
        {{ t('cluster.attention.show_all_details') }}
      </summary>
      <ul class="mt-2 space-y-2 pl-1">
        <li
          v-for="point in overflowPoints"
          :key="point.id"
          class="flex flex-wrap items-start justify-between gap-2"
        >
          <div class="min-w-0 flex-1">
            <span class="font-medium">{{ point.title }}</span>
            <span class="text-gray-600 dark:text-gray-400"> — {{ point.summary }}</span>
          </div>
          <UButton
            v-if="actionLabel(point)"
            size="xs"
            color="gray"
            variant="soft"
            @click="$emit('action', point)"
          >
            {{ actionLabel(point) }}
          </UButton>
        </li>
      </ul>
    </details>
  </div>
</template>

<script setup lang="ts">
import type { ClusterAttentionPoint } from '~/types/cluster-admin'

const props = withDefaults(defineProps<{
  points: ClusterAttentionPoint[]
  maxVisible?: number
}>(), {
  maxVisible: 3,
})

defineEmits<{
  action: [point: ClusterAttentionPoint]
}>()

const { t } = useEsosI18n()

const visiblePoints = computed(() =>
  props.points.filter(p => p.severity !== 'info').slice(0, props.maxVisible),
)
const overflowPoints = computed(() =>
  props.points.filter(p => p.severity !== 'info').slice(props.maxVisible),
)
const totalCount = computed(() => props.points.filter(p => p.severity !== 'info').length)

function actionLabel(point: ClusterAttentionPoint): string | null {
  const key = `cluster.attention.action.${point.recommendedAction}`
  const label = t(key)
  return label !== key ? label : null
}
</script>
