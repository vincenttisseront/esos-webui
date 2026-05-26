<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <span>{{ t('storage.fs.overview.backends_fileio_title') }}</span>
        <div class="flex gap-1">
          <UButton size="xs" variant="ghost" @click="emit('navigate-lvm')">
            {{ t('storage.fs.backend.actions.open_lvm') }}
          </UButton>
          <UButton size="xs" variant="ghost" @click="emit('navigate-block-devices')">
            {{ t('storage.fs.backend.actions.view_block_devices') }}
          </UButton>
        </div>
      </div>
    </template>

    <div v-if="!backends.length" class="text-sm text-gray-500 dark:text-gray-400">
      {{ t('storage.fs.overview.empty_candidates') }}
    </div>

    <div
      v-else-if="blockioOnlyGap"
      class="rounded-lg border border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3"
    >
      <p class="text-sm font-medium text-blue-900 dark:text-blue-100">
        {{ t('storage.fs.workflow.blockio_exposed.title') }}
      </p>
      <p class="text-xs text-blue-800 dark:text-blue-200">
        {{ t('storage.fs.workflow.blockio_exposed.body') }}
      </p>
      <ul class="text-xs font-mono text-blue-900 dark:text-blue-100 space-y-1 pl-1">
        <li v-for="row in blockioBoundLvs" :key="row.path">
          {{ formatBlockioLvArrow(row) }}
        </li>
      </ul>
      <p class="text-xs text-blue-800 dark:text-blue-200">
        {{ t('storage.fs.workflow.blockio_exposed.fileio_separate') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="sm"
          color="primary"
          @click="emit('create-fileio-lv', { lvName: suggestedLvName, vgName: suggestedVgName ?? undefined })"
        >
          {{ t('storage.fs.workflow.blockio_exposed.cta_create_lv') }}
        </UButton>
        <UButton size="sm" color="gray" variant="soft" @click="emit('navigate-lvm')">
          {{ t('storage.fs.backend.actions.open_lvm') }}
        </UButton>
      </div>
    </div>

    <div v-else-if="!hasEligible" class="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
      <p class="text-sm font-medium text-amber-900 dark:text-amber-100">
        {{ t('storage.fs.backend.empty.title') }}
      </p>
      <p class="text-xs text-amber-800 dark:text-amber-200">
        {{ t('storage.fs.backend.empty.body') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" color="primary" @click="emit('navigate-lvm')">
          {{ t('storage.fs.backend.actions.open_lvm') }}
        </UButton>
        <UButton size="sm" color="gray" variant="soft" @click="emit('navigate-block-devices')">
          {{ t('storage.fs.backend.actions.view_block_devices') }}
        </UButton>
      </div>
    </div>

    <div v-else class="space-y-5">
      <section v-for="section in sections" :key="section.group">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          {{ t(section.titleKey) }}
          <span class="font-normal normal-case text-gray-400">({{ section.items.length }})</span>
        </h4>
        <div v-if="!section.items.length" class="text-xs text-gray-400 dark:text-gray-500 pl-1">
          {{ t('storage.fs.backend.group.empty') }}
        </div>
        <ul v-else class="space-y-2">
          <li
            v-for="item in section.items"
            :key="item.path"
            class="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <button
                  type="button"
                  class="font-mono text-xs text-primary-600 dark:text-primary-400 hover:underline text-left break-all"
                  @click="emit('navigate-block-devices', item.path)"
                >
                  {{ item.path }}
                </button>
                <div class="flex flex-wrap items-center gap-2 mt-1">
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{ t(item.kindKey) }}</span>
                  <span v-if="item.sizeBytes > 0" class="text-xs text-gray-500 dark:text-gray-400">
                    · {{ formatBytes(item.sizeBytes) }}
                  </span>
                  <span
                    v-if="item.backend.displayName && item.backend.displayName !== item.path"
                    class="text-xs text-gray-400"
                  >
                    · {{ item.backend.displayName }}
                  </span>
                </div>
              </div>
              <UBadge :color="badgeColor(item.statusGroup)" size="xs" variant="subtle">
                {{ t(item.statusBadgeKey) }}
              </UBadge>
            </div>

            <p class="text-sm text-gray-800 dark:text-gray-200 mt-2">
              {{ t(item.summaryKey, item.summaryParams ?? {}) }}
            </p>

            <ul
              v-if="item.reasonViews.length && item.statusGroup !== 'available'"
              class="mt-1.5 space-y-0.5 text-xs text-gray-600 dark:text-gray-400"
            >
              <li v-for="(rv, ri) in item.reasonViews" :key="ri" class="flex gap-1.5">
                <span class="text-gray-400 shrink-0">•</span>
                <span>{{ t(rv.messageKey, rv.messageParams ?? {}) }}</span>
              </li>
            </ul>

            <p
              v-if="item.recommendationKey"
              class="mt-2 text-xs text-primary-700 dark:text-primary-300 bg-primary-50/60 dark:bg-primary-950/30 rounded px-2 py-1.5"
            >
              {{ t(item.recommendationKey, item.summaryParams ?? {}) }}
            </p>
          </li>
        </ul>
      </section>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { formatBytes } from '~/utils/fs-provisioning-chain'
import {
  groupFileioBackends,
  hasEligibleFileioBackend,
  type FsBackendEligibilityView,
  type FsBackendStatusGroup,
} from '~/utils/fs-backend-eligibility'
import type { FsBackendRef } from '~/types/filesystem'
import type { BlockioBoundLvRow } from '~/utils/storage-workflow-guidance'
import { formatBlockioLvArrow } from '~/utils/storage-workflow-guidance'

const props = defineProps<{
  backends: FsBackendRef[]
  blockioOnlyGap?: boolean
  blockioBoundLvs?: BlockioBoundLvRow[]
  suggestedLvName?: string
  suggestedVgName?: string | null
}>()

const emit = defineEmits<{
  'navigate-block-devices': [path?: string]
  'navigate-lvm': []
  'create-fileio-lv': [payload: { lvName: string; vgName?: string }]
}>()

const { t } = useEsosI18n()

const grouped = computed(() => groupFileioBackends(props.backends))
const hasEligible = computed(() => hasEligibleFileioBackend(props.backends))
const blockioOnlyGap = computed(() => props.blockioOnlyGap ?? false)
const blockioBoundLvs = computed(() => props.blockioBoundLvs ?? [])
const suggestedLvName = computed(() => props.suggestedLvName ?? 'fileio_store')
const suggestedVgName = computed(() => props.suggestedVgName ?? null)

const sections = computed(() => {
  const order: FsBackendStatusGroup[] = ['available', 'in_use', 'ineligible']
  const titleKeys: Record<FsBackendStatusGroup, string> = {
    available: 'storage.fs.backend.group.available',
    in_use: 'storage.fs.backend.group.in_use',
    ineligible: 'storage.fs.backend.group.ineligible',
  }
  return order.map(group => ({
    group,
    titleKey: titleKeys[group],
    items: grouped.value[group],
  }))
})

function badgeColor(group: FsBackendStatusGroup): 'green' | 'amber' | 'gray' {
  if (group === 'available') return 'green'
  if (group === 'in_use') return 'amber'
  return 'gray'
}
</script>
