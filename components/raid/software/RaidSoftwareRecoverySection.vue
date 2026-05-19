<template>
  <section class="space-y-3" aria-labelledby="raid-software-recovery-heading">
    <RaidCollapsibleSection
      :title="summaryTitle"
      icon="i-heroicons-wrench-screwdriver"
      :badge="totalCount > 0 ? String(totalCount) : undefined"
      badge-color="amber"
      :default-open="defaultOpen"
    >
      <div class="space-y-6 pt-2">
        <div
          v-if="assemblable.length"
          id="raid-software-stopped-assemblable"
          class="space-y-3"
        >
          <div>
            <h3 class="text-sm font-medium text-gray-800 dark:text-gray-200">
              {{ t('raid.stopped_md.section_assemblable_title') }}
            </h3>
            <p class="text-xs text-gray-500 mt-1">{{ t('raid.stopped_md.section_assemblable_description') }}</p>
          </div>
          <UCard v-for="arr in assemblable" :key="stoppedKey(arr)" class="overflow-hidden">
            <StoppedMdArrayCard
              :array="arr"
              :read-only="readOnly"
              :action-loading="stoppedMdActionKey === stoppedKey(arr)"
              :needs-advanced-cleanup="needsAdvancedCleanup(arr)"
              :advanced-cleanup-members="advancedCleanupMembersFor(stoppedMemberPaths(arr))"
              @assemble="$emit('assemble', $event)"
              @zero-superblocks="$emit('zero-superblocks', $event)"
              @advanced-cleanup="$emit('advanced-cleanup', $event)"
              @inspect="$emit('inspect', $event)"
            />
          </UCard>
        </div>

        <div
          v-if="orphanOrIncomplete.length"
          id="raid-software-stopped-orphan"
          class="space-y-3"
        >
          <div>
            <h3 class="text-sm font-medium text-gray-800 dark:text-gray-200">
              {{ t('raid.stopped_md.section_orphan_title') }}
            </h3>
            <p class="text-xs text-gray-500 mt-1">{{ t('raid.stopped_md.section_orphan_description') }}</p>
          </div>
          <UCard v-for="arr in orphanOrIncomplete" :key="stoppedKey(arr)" class="overflow-hidden">
            <StoppedMdArrayCard
              :array="arr"
              :read-only="readOnly"
              :action-loading="stoppedMdActionKey === stoppedKey(arr)"
              :needs-advanced-cleanup="needsAdvancedCleanup(arr)"
              :advanced-cleanup-members="advancedCleanupMembersFor(stoppedMemberPaths(arr))"
              @assemble="$emit('assemble', $event)"
              @zero-superblocks="$emit('zero-superblocks', $event)"
              @advanced-cleanup="$emit('advanced-cleanup', $event)"
              @inspect="$emit('inspect', $event)"
            />
          </UCard>
        </div>
      </div>
    </RaidCollapsibleSection>
  </section>
</template>

<script setup lang="ts">
import type { StoppedMdArray } from '~/types/raid'
import { stoppedArrayKey, stoppedMemberPaths } from '~/utils/stopped-md'

const props = defineProps<{
  assemblable: StoppedMdArray[]
  orphanOrIncomplete: StoppedMdArray[]
  readOnly: boolean
  isClustered: boolean
  stoppedMdActionKey: string | null
  needsAdvancedCleanup: (arr: StoppedMdArray) => boolean
  advancedCleanupMembersFor: (paths: string[]) => string[]
  defaultOpen?: boolean
}>()

defineEmits<{
  assemble: [arr: StoppedMdArray]
  'zero-superblocks': [arr: StoppedMdArray]
  'advanced-cleanup': [arr: StoppedMdArray]
  inspect: [arr: StoppedMdArray]
}>()

const { t } = useEsosI18n()

const totalCount = computed(() => props.assemblable.length + props.orphanOrIncomplete.length)

const summaryTitle = computed(() =>
  t('raid.software.cockpit.section.recovery_title', { count: totalCount.value }),
)

function stoppedKey(arr: StoppedMdArray) {
  return stoppedArrayKey(arr)
}
</script>
