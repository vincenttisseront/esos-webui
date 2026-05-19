<template>
  <UCard>
    <p class="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
      {{ t('raid.software.summary.title') }}
    </p>
    <motion.div class="flex flex-wrap gap-2">
      <button
        v-if="counts.active > 0"
        type="button"
        class="text-xs rounded-full px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 hover:ring-1 ring-green-300"
        @click="$emit('navigate', 'software-active')"
      >
        {{ t('raid.software.summary.active', { count: counts.active }) }}
      </button>
      <button
        v-if="counts.rebuilding > 0"
        type="button"
        class="text-xs rounded-full px-3 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 hover:ring-1 ring-amber-300"
        @click="$emit('navigate', 'software-active')"
      >
        {{ t('raid.software.summary.rebuilding', { count: counts.rebuilding }) }}
      </button>
      <button
        v-if="counts.stoppedAssemblable > 0"
        type="button"
        class="text-xs rounded-full px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 hover:ring-1 ring-blue-300"
        @click="$emit('navigate', 'software-stopped-assemblable')"
      >
        {{ t('raid.software.summary.stopped', { count: counts.stoppedAssemblable }) }}
      </button>
      <button
        v-if="counts.orphan > 0"
        type="button"
        class="text-xs rounded-full px-3 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200 hover:ring-1 ring-orange-300"
        @click="$emit('navigate', 'software-stopped-orphan')"
      >
        {{ t('raid.software.summary.orphan', { count: counts.orphan }) }}
      </button>
      <button
        v-if="counts.peerMd > 0"
        type="button"
        class="text-xs rounded-full px-3 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 hover:ring-1 ring-purple-300"
        @click="$emit('navigate', 'software-peer')"
      >
        {{ t('raid.software.summary.peer_md', { count: counts.peerMd }) }}
      </button>
    </motion.div>
  </UCard>
</template>

<script setup lang="ts">
export type RaidSoftwareSummaryAnchor =
  | 'software-active'
  | 'software-stopped-assemblable'
  | 'software-stopped-orphan'
  | 'software-peer'

defineProps<{
  counts: {
    active: number
    rebuilding: number
    stoppedAssemblable: number
    orphan: number
    peerMd: number
  }
}>()

defineEmits<{
  navigate: [anchor: RaidSoftwareSummaryAnchor]
}>()

const { t } = useEsosI18n()
</script>
