<template>
  <section class="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700" aria-labelledby="raid-software-footer-heading">
    <h2 id="raid-software-footer-heading" class="sr-only">
      {{ t('raid.software.cockpit.section.footer_title') }}
    </h2>

    <RaidCollapsibleSection
      :title="t('raid.cockpit.help.title')"
      icon="i-heroicons-question-mark-circle"
    >
      <div class="space-y-3 text-sm text-gray-600 dark:text-gray-400">
        <p class="font-medium text-gray-800 dark:text-gray-200">{{ t('raid.workflow.title') }}</p>
        <ol class="list-decimal pl-5 space-y-1">
          <li>{{ t('raid.workflow.step_prepare') }}</li>
          <li>{{ t('raid.workflow.step_create') }}</li>
          <li>{{ t('raid.workflow.step_use') }}</li>
        </ol>
      </div>
    </RaidCollapsibleSection>

    <RaidCollapsibleSection
      v-if="isClustered"
      :title="t('raid.software.help.cluster_title')"
      icon="i-heroicons-server"
    >
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {{ t('raid.cluster_md.software_alert_description') }}
      </p>
      <p v-if="hasActiveArrays" class="text-sm text-gray-600 dark:text-gray-400 mt-2">
        {{ t('raid.cluster_md.active_arrays_description') }}
      </p>
    </RaidCollapsibleSection>

    <RaidCollapsibleSection
      v-if="technicalDetails.length || mdBlockerItems.length"
      :title="t('raid.cockpit.technical_details.title')"
      icon="i-heroicons-code-bracket"
      :badge="technicalDetails.length ? String(technicalDetails.length) : undefined"
    >
      <div class="space-y-3 text-xs font-mono">
        <div
          v-for="detail in technicalDetails"
          :key="detail.id"
          class="space-y-0.5"
        >
          <p class="font-semibold text-gray-700 dark:text-gray-300">{{ detail.label }}</p>
          <p v-for="(line, li) in detail.lines" :key="li" class="text-gray-500 dark:text-gray-400 pl-2">{{ line }}</p>
        </div>
        <RaidMdBlockersPanel
          v-if="mdBlockerItems.length"
          embedded
          :items="mdBlockerItems"
          :current-san-id="currentSanId"
          :peer-raid-link="peerRaidLink"
          @navigate="$emit('navigate-md-detection', $event)"
        />
      </div>
    </RaidCollapsibleSection>
  </section>
</template>

<script setup lang="ts">
import type { MdDetectionItem, RaidTechnicalDetail } from '~/types/raid'

defineProps<{
  technicalDetails: RaidTechnicalDetail[]
  mdBlockerItems: MdDetectionItem[]
  currentSanId: string
  isClustered: boolean
  hasActiveArrays: boolean
  peerRaidLink: (peerSanId: string) => string
}>()

defineEmits<{
  'navigate-md-detection': [item: MdDetectionItem]
}>()

const { t } = useEsosI18n()
</script>
