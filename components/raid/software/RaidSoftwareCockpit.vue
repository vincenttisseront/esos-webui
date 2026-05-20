<template>
  <div class="space-y-6">
    <!-- Barre d'actions -->
    <div class="flex flex-wrap items-center justify-end gap-2 border-b border-gray-200 dark:border-gray-700 pb-4">
      <UButton
        v-if="!readOnly"
        color="amber"
        size="md"
        icon="i-heroicons-circle-stack"
        @click="$emit('prepare-partitions')"
      >
        {{ t('raid.prepare_partitions.action') }}
      </UButton>
      <UButton
        v-if="!readOnly"
        color="primary"
        size="md"
        icon="i-heroicons-plus"
        @click="$emit('create-md')"
      >
        {{ t('raid.create_md.action') }}
      </UButton>
      <UButton
        size="md"
        color="gray"
        variant="outline"
        icon="i-heroicons-arrow-path"
        :loading="loading || polling"
        @click="$emit('refresh')"
      >
        {{ t('raid.software.cockpit.refresh') }}
      </UButton>
    </div>

    <!-- Statut compact (répond à « le RAID est-il OK ? ») -->
    <RaidSoftwareStatusStrip
      :view-model="cockpit.status"
      :auto-refresh-active="autoRefreshActive"
    />

    <!-- Alertes critiques (compactes, onglet logiciel) -->
    <div v-if="criticalAlerts.length" class="space-y-2" role="alert">
      <UAlert
        v-for="alert in criticalAlerts"
        :key="alert.message"
        :title="alert.message"
        color="red"
        icon="i-heroicons-x-circle"
        variant="soft"
        size="sm"
      />
    </div>

  <template v-if="cockpit.hasActiveArrays">
    <!-- §1 Tableaux actifs (contenu principal) -->
    <section id="raid-software-active" class="space-y-4" aria-labelledby="raid-software-active-heading">
      <h2 id="raid-software-active-heading" class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {{ t('raid.software.cockpit.section.active_title') }}
        <span class="text-sm font-normal text-gray-500">({{ cockpit.activeArrays.length }})</span>
      </h2>
      <div class="space-y-4">
        <RaidActiveArrayCard
          v-for="arr in cockpit.activeArrays"
          :key="arr.path"
          :id="mdArrayDomId(arr)"
          :array="arr"
          :highlighted="arr.path === highlightedArrayPath"
          :is-clustered="isClustered"
          @stop="$emit('stop-md', $event)"
          @add-member="(a, intent) => $emit('add-md-member', a, intent)"
          @set-faulty="(a, m) => $emit('set-faulty', a, m)"
          @remove-device="(a, m) => $emit('remove-md-device', a, m)"
        />
      </div>
    </section>

    <!-- §2 Actions recommandées -->
    <RaidSoftwareRecommendedActions
      v-if="cockpit.hasRecommendedActions"
      :groups="cockpit.recommendedActions"
      @action="$emit('cockpit-action', $event)"
    />

    <!-- §3 Récupération -->
    <RaidSoftwareRecoverySection
      v-if="cockpit.hasRecovery"
      :assemblable="assemblable"
      :orphan-or-incomplete="orphanOrIncomplete"
      :read-only="readOnly"
      :is-clustered="isClustered"
      :stopped-md-action-key="stoppedMdActionKey"
      :needs-advanced-cleanup="needsAdvancedCleanup"
      :advanced-cleanup-members-for="advancedCleanupMembersFor"
      @assemble="$emit('assemble-stopped', $event)"
      @zero-superblocks="$emit('zero-stopped', $event)"
      @advanced-cleanup="$emit('advanced-cleanup-stopped', $event)"
      @inspect="$emit('inspect-stopped', $event)"
    />
  </template>

  <template v-else>
    <!-- Aucun tableau actif : vide → récupération → actions -->
    <section class="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/20 px-6 py-10 text-center">
      <UIcon name="i-heroicons-server-stack" class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" aria-hidden="true" />
      <h2 class="text-base font-semibold text-gray-800 dark:text-gray-200">
        {{ t('raid.software.cockpit.empty.active_title') }}
      </h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
        {{ cockpit.showEmptyMdState ? t('raid.md_detection.empty_hint') : t('raid.software.cockpit.empty.active_hint') }}
      </p>
      <div v-if="!readOnly" class="mt-4 flex flex-wrap justify-center gap-2">
        <UButton color="primary" size="md" icon="i-heroicons-plus" @click="$emit('create-md')">
          {{ t('raid.create_md.action') }}
        </UButton>
        <UButton color="amber" size="md" variant="soft" icon="i-heroicons-circle-stack" @click="$emit('prepare-partitions')">
          {{ t('raid.prepare_partitions.action') }}
        </UButton>
      </div>
    </section>

    <RaidSoftwareRecoverySection
      v-if="cockpit.hasRecovery"
      :assemblable="assemblable"
      :orphan-or-incomplete="orphanOrIncomplete"
      :read-only="readOnly"
      :is-clustered="isClustered"
      :stopped-md-action-key="stoppedMdActionKey"
      :needs-advanced-cleanup="needsAdvancedCleanup"
      :advanced-cleanup-members-for="advancedCleanupMembersFor"
      @assemble="$emit('assemble-stopped', $event)"
      @zero-superblocks="$emit('zero-stopped', $event)"
      @advanced-cleanup="$emit('advanced-cleanup-stopped', $event)"
      @inspect="$emit('inspect-stopped', $event)"
    />

    <RaidSoftwareRecommendedActions
      v-if="cockpit.hasRecommendedActions"
      :groups="cockpit.recommendedActions"
      @action="$emit('cockpit-action', $event)"
    />
  </template>

    <!-- §4 Aide et détails techniques (toujours en bas, replié) -->
    <RaidSoftwareFooterSection
      :technical-details="cockpit.status.technicalDetails"
      :md-blocker-items="mdBlockerItems"
      :current-san-id="currentSanId"
      :is-clustered="isClustered"
      :has-active-arrays="cockpit.hasActiveArrays"
      :peer-raid-link="peerRaidLink"
      @navigate-md-detection="$emit('navigate-md-detection', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type {
  MdArray,
  MdDetectionItem,
  MdMemberDevice,
  RaidActionableItem,
  RaidOverviewResponse,
  RaidSoftwareCockpitViewModel,
  StoppedMdArray,
} from '~/types/raid'

type RaidAlert = RaidOverviewResponse['alerts'][number]

defineProps<{
  cockpit: RaidSoftwareCockpitViewModel
  readOnly: boolean
  isClustered: boolean
  currentSanId: string
  loading: boolean
  polling: boolean
  autoRefreshActive: boolean
  criticalAlerts: RaidAlert[]
  highlightedArrayPath: string | null
  assemblable: StoppedMdArray[]
  orphanOrIncomplete: StoppedMdArray[]
  stoppedMdActionKey: string | null
  mdBlockerItems: MdDetectionItem[]
  needsAdvancedCleanup: (arr: StoppedMdArray) => boolean
  advancedCleanupMembersFor: (paths: string[]) => string[]
  peerRaidLink: (peerSanId: string) => string
}>()

defineEmits<{
  'prepare-partitions': []
  'create-md': []
  refresh: []
  'stop-md': [arr: MdArray]
  'add-md-member': [arr: MdArray, intent: import('~/types/raid').MdAddMemberIntent]
  'set-faulty': [arr: MdArray, member: MdMemberDevice]
  'remove-md-device': [arr: MdArray, member: MdMemberDevice]
  'assemble-stopped': [arr: StoppedMdArray]
  'zero-stopped': [arr: StoppedMdArray]
  'advanced-cleanup-stopped': [arr: StoppedMdArray]
  'inspect-stopped': [arr: StoppedMdArray]
  'cockpit-action': [item: RaidActionableItem]
  'navigate-md-detection': [item: MdDetectionItem]
}>()

const { t } = useEsosI18n()

function mdArrayDomId(arr: MdArray): string {
  return `md-array-${arr.name}`
}
</script>
