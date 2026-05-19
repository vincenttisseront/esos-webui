<template>
  <article
    class="rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
    :class="{ 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900': highlighted }"
  >
    <div class="px-5 py-4 space-y-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-mono text-lg font-bold text-gray-900 dark:text-gray-100">
              {{ array.path }}
            </h3>
            <UBadge :color="stateColor" :label="stateLabel" size="sm" variant="solid" />
            <UBadge color="gray" :label="`RAID ${array.raidLevel}`" size="sm" variant="outline" />
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('raid.software.cockpit.array.members', { active: array.activeDevices, total: array.raidDevices }) }}
            <span class="mx-1 text-gray-300 dark:text-gray-600">·</span>
            {{ sizeLabel }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <UButton
            size="sm"
            color="red"
            variant="outline"
            icon="i-heroicons-stop-circle"
            @click="$emit('stop', array)"
          >
            {{ t('raid.software.cockpit.array.stop') }}
          </UButton>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="i-heroicons-plus"
            @click="$emit('add-device', array)"
          >
            {{ t('raid.software.cockpit.array.add') }}
          </UButton>
        </div>
      </div>

      <div
        v-if="array.progress"
        class="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 space-y-2"
        role="status"
        :aria-label="t('raid.software.cockpit.array.resync_aria')"
      >
        <div class="flex justify-between text-sm font-medium text-amber-900 dark:text-amber-200">
          <span class="capitalize">{{ array.progress.action }}</span>
          <span>{{ array.progress.percent.toFixed(1) }}%</span>
        </div>
        <div class="h-2 bg-amber-200/60 dark:bg-amber-900/50 rounded-full overflow-hidden">
          <div
            class="h-full bg-amber-500 transition-all"
            :style="{ width: `${array.progress.percent}%` }"
          />
        </div>
        <div class="flex justify-between text-xs text-amber-800/80 dark:text-amber-300/80">
          <span v-if="array.progress.speedKbps">{{ (array.progress.speedKbps / 1024).toFixed(0) }} MB/s</span>
          <span v-if="array.progress.finishEta">ETA : {{ array.progress.finishEta }}</span>
        </div>
      </div>

      <ul v-if="array.warnings.length" class="space-y-1" role="list">
        <li
          v-for="w in array.warnings"
          :key="w"
          class="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2"
        >
          <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          {{ w }}
        </li>
      </ul>

      <RaidCollapsibleSection
        :title="t('raid.software.cockpit.array.details')"
        icon="i-heroicons-chevron-down"
        :default-open="false"
      >
        <div class="space-y-3 text-sm">
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 font-mono">
            <span v-if="array.uuid">UUID {{ array.uuid }}</span>
            <span v-if="array.metadataVersion">metadata {{ array.metadataVersion }}</span>
            <span v-if="array.detailState">mdadm {{ array.detailState }}</span>
            <span v-if="array.spareDevices > 0">{{ array.spareDevices }} spare(s)</span>
            <span v-if="array.chunkKb">chunk {{ array.chunkKb }}K</span>
          </div>
          <MdMembersTable
            :members="array.members"
            @set-faulty="(m) => $emit('set-faulty', array, m)"
            @remove="(m) => $emit('remove-device', array, m)"
          />
        </div>
      </RaidCollapsibleSection>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { MdArray, MdMemberDevice } from '~/types/raid'

const props = defineProps<{
  array: MdArray
  highlighted?: boolean
}>()

defineEmits<{
  stop: [arr: MdArray]
  'add-device': [arr: MdArray]
  'set-faulty': [arr: MdArray, member: MdMemberDevice]
  'remove-device': [arr: MdArray, member: MdMemberDevice]
}>()

const { t } = useEsosI18n()

const stateColor = computed(() => {
  const s = props.array.state
  if (s === 'active' || s === 'clean') return 'green'
  if (s === 'degraded' || s === 'failed') return 'red'
  if (s === 'recovering' || s === 'resync') return 'amber'
  return 'gray'
})

const stateLabel = computed(() => {
  const s = props.array.state
  const key = `raid.cockpit.array_status.${s}` as const
  const translated = t(key)
  return translated !== key ? translated : s
})

const sizeLabel = computed(() => formatSize(props.array.sizeBytes))

function formatSize(bytes?: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}
</script>
