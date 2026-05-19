<template>
  <div class="space-y-2">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-gray-400 shrink-0" />
          <span class="font-mono font-semibold text-gray-900 dark:text-gray-100">{{ array.path }}</span>
          <UBadge :color="stateColor" :label="array.state" size="xs" variant="soft" />
          <UBadge color="gray" :label="`RAID${array.raidLevel}`" size="xs" variant="outline" />
          <span class="text-xs text-gray-500">{{ array.activeDevices }}/{{ array.raidDevices }} actif(s)</span>
          <span v-if="array.failedDevices > 0" class="text-xs text-red-600 dark:text-red-400">{{ array.failedDevices }} en échec</span>
        </div>
      </div>
      <div class="flex gap-2 shrink-0">
        <UButton size="xs" color="amber" variant="ghost" icon="i-heroicons-plus" @click="$emit('add-device', array)">
          Ajouter
        </UButton>
        <UTooltip :text="t('raid.stopped_md.stop_hint')">
          <UButton size="xs" color="red" variant="ghost" icon="i-heroicons-stop-circle" @click="$emit('stop', array)">
            Arrêter
          </UButton>
        </UTooltip>
      </div>
    </div>

    <div v-if="array.progress" class="bg-gray-100 dark:bg-gray-800 rounded px-3 py-2">
      <div class="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span class="capitalize">{{ array.progress.action }}</span>
        <span>{{ array.progress.percent.toFixed(1) }}%</span>
      </div>
      <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          class="h-full bg-amber-500 transition-all"
          :style="{ width: `${array.progress.percent}%` }"
        />
      </div>
      <div class="flex justify-between text-[10px] text-gray-600 mt-1">
        <span v-if="array.progress.speedKbps">{{ (array.progress.speedKbps / 1024).toFixed(0) }} MB/s</span>
        <span v-if="array.progress.finishEta">ETA : {{ array.progress.finishEta }}</span>
      </div>
    </div>

    <div v-for="w in array.warnings" :key="w" class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3 shrink-0" />{{ w }}
    </div>

    <RaidArrayDetailsCollapse>
      <div class="flex flex-wrap gap-x-4 text-xs text-gray-500">
        <span v-if="array.uuid">UUID : {{ array.uuid }}</span>
        <span v-if="array.metadataVersion">metadata {{ array.metadataVersion }}</span>
        <span v-if="array.detailState">état mdadm : {{ array.detailState }}</span>
        <span v-if="array.spareDevices > 0" class="text-blue-600 dark:text-blue-400">{{ array.spareDevices }} spare(s)</span>
        <span v-if="array.sizeBytes">{{ formatSize(array.sizeBytes) }}</span>
        <span v-if="array.chunkKb">chunk {{ array.chunkKb }}K</span>
      </div>
      <MdMembersTable
        class="mt-2"
        :members="array.members"
        @set-faulty="(m) => $emit('set-faulty', array, m)"
        @remove="(m) => $emit('remove-device', array, m)"
      />
    </RaidArrayDetailsCollapse>
  </div>
</template>

<script setup lang="ts">
import type { MdArray, MdMemberDevice } from '~/types/raid'

const props = defineProps<{ array: MdArray }>()
const { t } = useEsosI18n()
defineEmits<{
  stop: [arr: MdArray]
  'add-device': [arr: MdArray]
  'set-faulty': [arr: MdArray, member: MdMemberDevice]
  'remove-device': [arr: MdArray, member: MdMemberDevice]
}>()

const stateColor = computed(() => {
  const s = props.array.state
  if (s === 'active' || s === 'clean') return 'green'
  if (s === 'degraded' || s === 'failed') return 'red'
  if (s === 'recovering' || s === 'resync') return 'amber'
  if (s === 'inactive') return 'gray'
  return 'gray'
})

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}
</script>
