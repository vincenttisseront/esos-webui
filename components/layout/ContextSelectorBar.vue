<template>
  <div v-if="showTopContextSelector" class="flex items-center gap-1.5 overflow-x-auto min-w-0">
    <template v-if="showMultiSelector">
      <template v-if="sanSelector.standaloneSans.value.length > 1">
        <button
          type="button"
          class="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors shrink-0"
          :class="sanSelector.isAll.value
            ? 'bg-primary-600 text-white border-primary-600'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400'"
          @click="emit('switch', ALL_SANS_ID)"
        >
          <UIcon name="i-heroicons-server-stack" class="w-3 h-3" />
          {{ t('common.all') }}
        </button>
        <span class="h-4 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
      </template>

      <button
        v-for="san in sanSelector.standaloneSans.value"
        :key="san.id"
        type="button"
        class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors shrink-0"
        :class="!sanSelector.isAll.value && sanSelector.selected.value?.id === san.id
          ? 'bg-primary-600 text-white border-primary-600'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400'"
        @click="emit('switch', san.id)"
      >
        <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="sshDotClass(san.id)" />
        <span class="font-mono">{{ san.label }}</span>
      </button>

      <template v-if="sanSelector.standaloneSans.value.length > 0 && sanSelector.clusters.value.length > 0">
        <span class="h-4 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
      </template>

      <button
        v-for="cluster in sanSelector.clusters.value"
        :key="cluster.id"
        type="button"
        class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors shrink-0"
        :class="sanSelector.selectedCluster.value?.id === cluster.id
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'"
        @click="emit('switch', cluster.id)"
      >
        <UIcon name="i-heroicons-server-stack" class="w-3 h-3 shrink-0" />
        <span>{{ cluster.name }}</span>
        <span
          class="ml-0.5 text-[9px] px-1 py-0.5 rounded font-semibold uppercase tracking-wide"
          :class="sanSelector.selectedCluster.value?.id === cluster.id
            ? 'bg-indigo-500 text-indigo-100'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'"
        >HA</span>
      </button>
    </template>

    <template v-else>
      <span
        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shrink-0"
      >
        <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="sshDotClass(singleSanId)" />
        <span class="font-mono">{{ singleSanLabel }}</span>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ALL_SANS_ID } from '~/composables/useSelectedSan'

defineProps<{
  showTopContextSelector: boolean
  showMultiSelector: boolean
}>()

const emit = defineEmits<{ (e: 'switch', id: string): void }>()

const { t } = useEsosI18n()
const sanSelector = useSelectedSan()

const singleSan = computed(() => sanSelector.activeSans.value[0] ?? null)
const singleSanId = computed(() => singleSan.value?.id ?? '')
const singleSanLabel = computed(() => singleSan.value?.label ?? '—')

function sshDotClass(sanId: string): string {
  const s = sanSelector.sshStatuses.value[sanId]
  if (s === 'connected') return 'bg-green-400'
  if (s === 'reconnecting') return 'bg-orange-400 animate-pulse'
  if (s === 'error') return 'bg-red-500'
  return 'bg-gray-400'
}
</script>
