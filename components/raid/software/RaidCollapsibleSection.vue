<template>
  <details
    ref="detailsEl"
    class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/30"
    :open="defaultOpen"
    @toggle="onToggle"
  >
    <summary
      class="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-200 select-none flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden list-none"
    >
      <span class="flex items-center gap-2 min-w-0">
        <UIcon v-if="icon" :name="icon" class="w-4 h-4 shrink-0 text-gray-400" />
        <span class="truncate">{{ title }}</span>
        <UBadge v-if="badge" :color="badgeColor" :label="badge" size="xs" variant="soft" class="shrink-0" />
      </span>
      <span class="text-xs font-normal text-gray-500 dark:text-gray-400 shrink-0">
        {{ open ? t('raid.software.cockpit.toggle_hide') : t('raid.software.cockpit.toggle_show') }}
      </span>
    </summary>
    <motion.div
      v-if="open"
      class="px-4 pb-4 pt-0 border-t border-gray-200 dark:border-gray-700"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :transition="{ duration: 0.15 }"
    >
      <slot />
    </motion.div>
  </details>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  icon?: string
  badge?: string
  badgeColor?: 'gray' | 'amber' | 'red' | 'blue' | 'green'
  defaultOpen?: boolean
}>(), {
  badgeColor: 'gray',
  defaultOpen: false,
})

const { t } = useEsosI18n()
const detailsEl = ref<HTMLDetailsElement | null>(null)
const open = ref(props.defaultOpen)

function onToggle() {
  open.value = detailsEl.value?.open ?? false
}

watch(() => props.defaultOpen, (v) => {
  open.value = v
  if (detailsEl.value) detailsEl.value.open = v
})
</script>
