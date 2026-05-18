<template>
  <div class="space-y-3">
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 flex-wrap">
          <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-gray-400" />
          <span class="font-semibold text-gray-900 dark:text-gray-100">{{ displayTitle }}</span>
          <UBadge :color="stateColor" :label="stateLabel" size="xs" variant="soft" />
          <UBadge v-if="array.raidLevel !== 'unknown'" color="gray" :label="`RAID${array.raidLevel}`" size="xs" variant="outline" />
        </div>
        <div class="flex flex-wrap gap-x-4 mt-1 text-xs text-gray-500">
          <span v-if="array.uuid">UUID : {{ array.uuid }}</span>
          <span v-if="array.metadataVersion">metadata {{ array.metadataVersion }}</span>
          <span>{{ t('raid.stopped_md.members_count', { count: array.members.length, expected: array.raidDevices }) }}</span>
        </div>
      </div>
      <div v-if="!readOnly" class="flex flex-wrap gap-2 shrink-0 justify-end">
        <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-magnifying-glass" @click="$emit('inspect', array)">
          {{ t('raid.stopped_md.inspect') }}
        </UButton>
        <UButton size="xs" color="blue" variant="soft" icon="i-heroicons-play" @click="$emit('assemble', array)">
          {{ t('raid.stopped_md.assemble') }}
        </UButton>
        <UButton size="xs" color="red" variant="ghost" icon="i-heroicons-trash" @click="$emit('zero-superblocks', array)">
          {{ t('raid.stopped_md.zero_superblocks') }}
        </UButton>
      </div>
    </div>

    <div v-for="w in array.warnings" :key="w" class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3" />{{ w }}
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-left text-gray-500 border-b border-gray-200">
            <th class="py-1 pr-3">{{ t('raid.stopped_md.member_path') }}</th>
            <th class="py-1 pr-3">{{ t('raid.stopped_md.member_state') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in array.members" :key="member.path" class="border-b border-gray-100">
            <td class="py-1.5 pr-3 font-mono text-gray-800">{{ member.path }}</td>
            <td class="py-1.5 pr-3 text-gray-600">
              {{ member.present ? t('raid.stopped_md.member_present') : t('raid.stopped_md.member_missing') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StoppedMdArray } from '~/types/raid'

const props = defineProps<{
  array: StoppedMdArray
  readOnly?: boolean
}>()

defineEmits<{
  assemble: [array: StoppedMdArray]
  'zero-superblocks': [array: StoppedMdArray]
  inspect: [array: StoppedMdArray]
}>()

const { t } = useEsosI18n()

const displayPath = computed(() => props.array.path ?? `/dev/${props.array.name}`)
const displayTitle = computed(() => {
  if (props.array.path) return props.array.path
  if (props.array.name && props.array.name !== 'unknown') return `/dev/${props.array.name}`
  if (props.array.stoppedState === 'assemblable') return t('raid.stopped_md.detected_array')
  return t('raid.stopped_md.orphan_metadata')
})

const stateLabel = computed(() => t(`raid.stopped_md.state.${props.array.stoppedState}`))

const stateColor = computed(() => {
  if (props.array.stoppedState === 'assemblable') return 'green'
  if (props.array.stoppedState === 'incomplete') return 'amber'
  if (props.array.stoppedState === 'ambiguous') return 'red'
  return 'gray'
})
</script>
