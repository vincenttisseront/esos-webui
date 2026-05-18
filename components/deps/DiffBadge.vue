<template>
  <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md" :class="cls">
    <span v-if="diff !== 'up-to-date'">{{ arrow }}</span>
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import type { SemverDiff } from '~/server/utils/types'

const props = defineProps<{ diff: SemverDiff }>()
const { t } = useEsosI18n()

const CONFIG: Record<SemverDiff, { arrow: string; cls: string }> = {
  major:       { arrow: 'up', cls: 'bg-red-100 text-red-700' },
  minor:       { arrow: 'up', cls: 'bg-amber-100 text-amber-700' },
  patch:       { arrow: 'up', cls: 'bg-blue-100 text-blue-700' },
  'up-to-date': { arrow: 'ok', cls: 'bg-green-100 text-green-700' },
  unknown:     { arrow: '?', cls: 'bg-gray-100 text-gray-500' },
}

const diffKey = computed(() =>
  ({
    major:        'major',
    minor:        'minor',
    patch:        'patch',
    'up-to-date': 'upToDate',
    unknown:      'unknown',
  } as const)[props.diff],
)

const label = computed(() => t(`admin.dependencies.diff.${diffKey.value}`))
const arrow = computed(() => CONFIG[props.diff].arrow)
const cls = computed(() => CONFIG[props.diff].cls)
</script>
