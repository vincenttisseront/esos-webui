<template>
  <div class="space-y-3">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-gray-400 shrink-0" />
          <span class="font-semibold text-gray-900 dark:text-gray-100">{{ cardTitle }}</span>
          <UBadge color="gray" :label="t(`raid.stopped_md.confidence.${array.confidence}`)" size="xs" variant="outline" />
        </div>
        <p v-if="array.displaySubtitle" class="text-xs font-mono text-gray-500 mt-0.5 truncate">
          {{ array.displaySubtitle }}
        </p>
        <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
          <UBadge v-if="array.raidLevelKnown" color="gray" :label="`RAID ${array.raidLevel}`" size="xs" variant="outline" />
          <span v-else class="text-gray-400">{{ t('raid.stopped_md.raid_level_unknown') }}</span>
          <span v-if="array.uuid">UUID : {{ array.uuid }}</span>
          <span v-if="array.metadataVersion">metadata {{ array.metadataVersion }}</span>
          <span>{{ t('raid.stopped_md.members_count', { count: presentCount, expected: array.raidDevices }) }}</span>
        </div>
      </div>
    </div>

    <div
      class="rounded-md px-3 py-2 text-xs"
      :class="recommendedCalloutClass"
    >
      {{ recommendedLabel }}
    </div>

    <ul v-if="array.missingSummary.length" class="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 list-disc pl-4">
      <li v-for="item in array.missingSummary" :key="item">{{ item }}</li>
    </ul>

    <div v-for="w in array.warnings" :key="w" class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3 shrink-0" />{{ w }}
    </div>

    <div v-if="array.members.length" class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead>
          <tr class="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <th class="py-1 pr-3">{{ t('raid.stopped_md.member_path') }}</th>
            <th class="py-1 pr-3">{{ t('raid.stopped_md.member_state') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in array.members" :key="member.path" class="border-b border-gray-100 dark:border-gray-800">
            <td class="py-1.5 pr-3 font-mono text-gray-800 dark:text-gray-200">{{ member.path }}</td>
            <td class="py-1.5 pr-3 text-gray-600 dark:text-gray-400">
              {{ member.present ? t('raid.stopped_md.member_present') : t('raid.stopped_md.member_missing') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!readOnly" class="flex flex-wrap gap-2 justify-end">
      <UButton
        v-if="showInspectPrimary"
        size="sm"
        color="primary"
        variant="solid"
        icon="i-heroicons-magnifying-glass"
        @click="$emit('inspect', array)"
      >
        {{ t('raid.stopped_md.inspect') }}
      </UButton>
      <UButton
        v-else-if="showInspectSecondary"
        size="sm"
        color="gray"
        variant="ghost"
        icon="i-heroicons-magnifying-glass"
        @click="$emit('inspect', array)"
      >
        {{ t('raid.stopped_md.inspect') }}
      </UButton>
      <UButton
        v-if="array.canAssemble"
        size="sm"
        color="blue"
        variant="solid"
        icon="i-heroicons-play"
        @click="$emit('assemble', array)"
      >
        {{ t('raid.stopped_md.assemble') }}
      </UButton>
    </div>

    <div v-if="!readOnly && array.canZeroSuperblocks" class="pt-3 mt-1 border-t border-red-200 dark:border-red-900/50 space-y-2">
      <p class="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
        {{ t('raid.stopped_md.destructive_zone_title') }}
      </p>
      <p class="text-xs text-gray-600 dark:text-gray-400">
        {{ t('raid.stopped_md.destructive_zone_description') }}
      </p>
      <p v-if="array.category !== 'assemblable'" class="text-xs text-amber-700 dark:text-amber-400">
        {{ t('raid.stopped_md.zero_orphan_warning') }}
      </p>
      <div class="flex justify-end">
        <UButton
          size="sm"
          color="red"
          variant="solid"
          icon="i-heroicons-trash"
          @click="$emit('zero-superblocks', array)"
        >
          {{ t('raid.stopped_md.zero_superblocks') }}
        </UButton>
      </div>
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

const cardTitle = computed(() => t(`raid.stopped_md.title.${props.array.displayKind}`))

const presentCount = computed(() => props.array.members.filter(m => m.present).length)

const recommendedLabel = computed(() =>
  props.array.recommendedAction === 'assemble'
    ? t('raid.stopped_md.recommended.assemble')
    : t('raid.stopped_md.recommended.inspect'),
)

const recommendedCalloutClass = computed(() =>
  props.array.recommendedAction === 'assemble'
    ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800'
    : 'bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
)

const showInspectPrimary = computed(() => props.array.recommendedAction === 'inspect')
const showInspectSecondary = computed(() => props.array.recommendedAction === 'assemble')
</script>
