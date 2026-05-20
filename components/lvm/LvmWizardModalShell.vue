<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-xl shadow-modal w-full relative max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden outline-none"
    role="dialog"
    aria-modal="true"
  >
    <div class="px-5 pt-5 pb-0 shrink-0 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon v-if="icon" :name="icon" class="w-5 h-5 text-primary-500 shrink-0" />
          <h3 class="font-semibold text-gray-900 dark:text-gray-100 truncate">{{ title }}</h3>
        </div>
        <span v-if="totalSteps > 1" class="text-xs text-gray-500 shrink-0">
          {{ t('lvm.cluster.wizard.step', { current: step, total: totalSteps }) }}
        </span>
      </div>
      <div v-if="totalSteps > 1" class="flex gap-1 mt-3 mb-3">
        <div
          v-for="i in totalSteps"
          :key="i"
          class="h-1 flex-1 rounded-full transition-colors"
          :class="i <= step ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'"
        />
      </div>
    </div>

    <div class="px-5 py-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <slot />
    </div>

    <div v-if="$slots.footer" class="px-5 py-4 shrink-0 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/50">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  step?: number
  totalSteps?: number
  icon?: string
}>()

const { t } = useEsosI18n()
</script>
