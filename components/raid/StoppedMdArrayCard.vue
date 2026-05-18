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
          <span>{{ t('raid.stopped_md.members_count', { count: presentMemberCount, expected: array.raidDevices }) }}</span>
        </div>
      </div>
      <div v-if="!readOnly" class="flex flex-col items-end gap-1 shrink-0 max-w-md">
        <div class="flex flex-wrap gap-2 justify-end">
          <UButton
            size="xs"
            color="gray"
            variant="ghost"
            icon="i-heroicons-magnifying-glass"
            :loading="actionLoading"
            :disabled="actionLoading"
            @click="$emit('inspect', array)"
          >
            {{ t('raid.stopped_md.inspect') }}
          </UButton>
          <UButton
            size="xs"
            color="blue"
            variant="soft"
            icon="i-heroicons-play"
            :loading="actionLoading"
            :disabled="actionLoading"
            @click="$emit('assemble', array)"
          >
            {{ t('raid.stopped_md.assemble') }}
          </UButton>
          <UButton
            size="xs"
            color="red"
            variant="ghost"
            icon="i-heroicons-trash"
            :loading="actionLoading"
            :disabled="actionLoading"
            @click="$emit('zero-superblocks', array)"
          >
            {{ t('raid.stopped_md.zero_superblocks') }}
          </UButton>
          <UButton
            v-if="showAdvancedCleanup"
            size="xs"
            color="amber"
            variant="soft"
            icon="i-heroicons-sparkles"
            :loading="actionLoading"
            :disabled="actionLoading"
            @click="$emit('advanced-cleanup', array)"
          >
            {{ t('raid.stopped_md.advanced_cleanup') }}
          </UButton>
        </div>
        <p class="text-[10px] text-gray-500 text-right leading-snug">
          {{ t('raid.stopped_md.assemble_help') }}
          <span class="block mt-0.5">{{ t('raid.stopped_md.zero_superblocks_help') }}</span>
          <span v-if="showAdvancedCleanup" class="block mt-0.5 text-amber-600 dark:text-amber-400">
            {{ t('raid.stopped_md.advanced_wipe_card_hint') }}
          </span>
        </p>
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
          <tr v-for="(member, idx) in array.members" :key="memberRowKey(member, idx)" class="border-b border-gray-100">
            <td class="py-1.5 pr-3 font-mono text-gray-800">{{ member.path }}</td>
            <td class="py-1.5 pr-3 text-gray-600" :title="memberStatusTitle(member)">
              <span class="inline-flex items-center gap-1.5 flex-wrap">
                {{ memberStatusLabel(member) }}
                <UBadge
                  v-if="memberNeedsAdvancedCleanup(member)"
                  color="amber"
                  size="xs"
                  variant="soft"
                  :label="t('raid.stopped_md.advanced_cleanup')"
                />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StoppedMdArray, StoppedMdArrayMember } from '~/types/raid'

const props = defineProps<{
  array: StoppedMdArray
  readOnly?: boolean
  actionLoading?: boolean
  needsAdvancedCleanup?: boolean
  advancedCleanupMembers?: string[]
}>()

defineEmits<{
  assemble: [array: StoppedMdArray]
  'zero-superblocks': [array: StoppedMdArray]
  'advanced-cleanup': [array: StoppedMdArray]
  inspect: [array: StoppedMdArray]
}>()

const showAdvancedCleanup = computed(() =>
  props.needsAdvancedCleanup === true
  || (props.advancedCleanupMembers?.length ?? 0) > 0,
)

const advancedMemberSet = computed(() => new Set(props.advancedCleanupMembers ?? []))

const { t } = useEsosI18n()

function memberPartitionPath(member: StoppedMdArrayMember): string {
  return member.path.startsWith('/dev/') ? member.path : `/dev/${member.path}`
}

function memberNeedsAdvancedCleanup(member: StoppedMdArrayMember): boolean {
  return advancedMemberSet.value.has(memberPartitionPath(member))
}

const displayPath = computed(() => props.array.path ?? `/dev/${props.array.name}`)
const displayTitle = computed(() => {
  if (props.array.path) return props.array.path
  if (props.array.name && props.array.name !== 'unknown') return `/dev/${props.array.name}`
  if (props.array.stoppedState === 'assemblable') return t('raid.stopped_md.detected_array')
  return t('raid.stopped_md.orphan_metadata')
})

const presentMemberCount = computed(() => props.array.members.filter(m => m.present).length)

const stateLabel = computed(() => t(`raid.stopped_md.state.${props.array.stoppedState}`))

const stateColor = computed(() => {
  if (props.array.stoppedState === 'assemblable') return 'green'
  if (props.array.stoppedState === 'incomplete') return 'amber'
  if (props.array.stoppedState === 'ambiguous') return 'red'
  return 'gray'
})

function memberRowKey(member: StoppedMdArrayMember, idx: number): string {
  return member.present ? member.path : `missing-${idx}`
}

function memberStatusLabel(member: StoppedMdArrayMember): string {
  const status = member.memberStatus
  if (status) {
    return t(`raid.stopped_md.member_status.${status}`)
  }
  return member.present ? t('raid.stopped_md.member_present') : t('raid.stopped_md.member_missing')
}

function memberStatusTitle(member: StoppedMdArrayMember): string {
  const parts = [`present=${member.present}`]
  if (member.memberStatus) parts.push(`status=${member.memberStatus}`)
  if (member.mdExamine?.state) parts.push(`examine.state=${member.mdExamine.state}`)
  return parts.join(', ')
}
</script>
