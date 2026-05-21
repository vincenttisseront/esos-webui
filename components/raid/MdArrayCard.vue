<template>
  <motion.div
    v-if="compact"
    class="space-y-2"
    :initial="{ opacity: 0, y: 4 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="{ duration: 0.2 }"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0 flex-1 space-y-1">
        <p class="font-mono font-semibold text-gray-900 dark:text-gray-100">{{ array.path }}</p>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ summaryLine }}</p>
      </div>
      <div class="flex gap-2 shrink-0">
        <UButton size="xs" color="red" variant="outline" icon="i-heroicons-stop-circle" @click="$emit('stop', array)">
          Arrêter
        </UButton>
      </div>
    </div>

    <motion.div
      v-if="array.progress"
      class="bg-gray-100 dark:bg-gray-800 rounded px-3 py-2"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
    >
      <div class="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
        <span class="capitalize">{{ array.progress.action }}</span>
        <span>{{ array.progress.percent.toFixed(1) }}%</span>
      </div>
      <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-amber-500 transition-all"
          :style="{ width: `${array.progress.percent}%` }"
        />
      </div>
      <div class="flex justify-between text-[10px] text-gray-600 dark:text-gray-400 mt-1">
        <span v-if="array.progress.speedKbps">{{ (array.progress.speedKbps / 1024).toFixed(0) }} MB/s</span>
        <span v-if="array.progress.finishEta">ETA : {{ array.progress.finishEta }}</span>
      </div>
    </motion.div>

    <div v-for="w in array.warnings" :key="w" class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3 shrink-0" />{{ w }}
    </div>

    <details class="rounded border border-gray-200 dark:border-gray-700 text-sm">
      <summary class="cursor-pointer px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 select-none list-none">
        {{ t('raid.cockpit.array.technical_toggle') }}
      </summary>
      <div class="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <div class="flex flex-wrap gap-x-4 text-xs text-gray-500 dark:text-gray-400">
          <span v-if="array.uuid">UUID : {{ array.uuid }}</span>
          <span v-if="array.metadataVersion">metadata {{ array.metadataVersion }}</span>
          <span v-if="array.detailState">état mdadm : {{ array.detailState }}</span>
          <span v-if="array.spareDevices > 0" class="text-blue-600 dark:text-blue-400">{{ array.spareDevices }} spare(s)</span>
          <span v-if="array.sizeBytes">{{ formatSize(array.sizeBytes) }}</span>
          <span v-if="array.chunkKb">chunk {{ array.chunkKb }}K</span>
        </div>
        <MdMembersTable
          :members="array.members"
          @set-faulty="(m) => $emit('set-faulty', array, m)"
          @remove="(m) => $emit('remove-device', array, m)"
        />
      </div>
    </details>
  </motion.div>

  <div v-else class="space-y-2">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-gray-400 shrink-0" />
          <span class="font-mono font-semibold text-gray-900 dark:text-gray-100">{{ array.path }}</span>
          <UBadge :color="stateColor" :label="array.state" size="xs" variant="soft" />
          <UBadge color="gray" :label="`RAID${array.raidLevel}`" size="xs" variant="outline" />
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ array.activeDevices }}/{{ array.raidDevices }} actif(s)</span>
          <span v-if="array.failedDevices > 0" class="text-xs text-red-600 dark:text-red-400">{{ array.failedDevices }} en échec</span>
        </div>
      </div>
      <div class="flex gap-2 shrink-0 items-center">
        <UButton
          v-if="addMemberUi.primary === 'replacement'"
          size="xs"
          color="primary"
          variant="soft"
          icon="i-heroicons-plus"
          @click="$emit('add-member', array, 'replacement')"
        >
          {{ t('raid.software.cockpit.array.add_member.replacement') }}
        </UButton>
        <UButton
          v-if="addMemberUi.showSpare"
          size="xs"
          color="gray"
          variant="soft"
          icon="i-heroicons-plus-circle"
          @click="$emit('add-member', array, 'spare')"
        >
          {{ t('raid.software.cockpit.array.add_member.spare') }}
        </UButton>
        <UTooltip v-if="addMemberUi.primary === 'none'" :text="unavailableTooltip">
          <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-plus" disabled />
        </UTooltip>
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
        <div
          class="h-full bg-amber-500 transition-all"
          :style="{ width: `${array.progress.percent}%` }"
        />
      </div>
      <div class="flex justify-between text-[10px] text-gray-600 dark:text-gray-400 mt-1">
        <span v-if="array.progress.speedKbps">{{ (array.progress.speedKbps / 1024).toFixed(0) }} MB/s</span>
        <span v-if="array.progress.finishEta">ETA : {{ array.progress.finishEta }}</span>
      </div>
    </div>

    <div v-for="w in array.warnings" :key="w" class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3 shrink-0" />{{ w }}
    </div>

    <RaidArrayDetailsCollapse>
      <div class="flex flex-wrap gap-x-4 text-xs text-gray-500 dark:text-gray-400">
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
import { resolveMdAddMemberUi } from '~/utils/md-array-add-member-ui'

const props = withDefaults(defineProps<{
  array: MdArray
  compact?: boolean
  isClustered?: boolean
}>(), {
  compact: false,
  isClustered: false,
})

const { t } = useEsosI18n()
defineEmits<{
  stop: [arr: MdArray]
  'add-member': [arr: MdArray, intent: import('~/types/raid').MdAddMemberIntent]
  'set-faulty': [arr: MdArray, member: MdMemberDevice]
  'remove-device': [arr: MdArray, member: MdMemberDevice]
}>()

const addMemberUi = computed(() => resolveMdAddMemberUi(props.array))

const unavailableTooltip = computed(() =>
  t('raid.software.cockpit.array.add_member.unavailable_tooltip'),
)

const stateColor = computed(() => {
  const s = props.array.state
  if (s === 'active' || s === 'clean') return 'green'
  if (s === 'degraded' || s === 'failed') return 'red'
  if (s === 'recovering' || s === 'resync') return 'amber'
  if (s === 'inactive') return 'gray'
  return 'gray'
})

const summaryLine = computed(() => {
  const a = props.array
  const size = a.sizeBytes ? formatSize(a.sizeBytes) : '—'
  return `RAID${a.raidLevel} · ${a.state} · ${a.activeDevices}/${a.raidDevices} actifs · ${size}`
})

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}
</script>
