<template>
  <div class="space-y-4">
    <!-- Niveau de risque -->
    <div class="flex items-center gap-2">
      <span class="text-sm text-gray-600 dark:text-gray-400">Niveau de risque :</span>
      <RaidRiskBadge :risk="preflight.riskLevel" />
    </div>

    <!-- Blockers -->
    <div v-if="preflight.blockers.length" class="space-y-1.5">
      <p class="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">Blocages</p>
      <div
        v-for="b in preflight.blockers"
        :key="b"
        class="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded px-3 py-2 text-sm text-red-700 dark:text-red-300"
      >
        <UIcon name="i-heroicons-x-circle" class="w-4 h-4 shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
        <span class="flex-1">{{ b }}</span>
      </div>
    </div>

    <div v-if="preflight.blockerRefs?.length" class="space-y-1.5">
      <div
        v-for="ref in preflight.blockerRefs"
        :key="`${ref.code}-${ref.path ?? ''}-${ref.sanId ?? ''}-${ref.message}`"
        class="flex flex-wrap items-center justify-between gap-2 bg-red-50/80 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded px-3 py-2 text-sm text-red-700 dark:text-red-300"
      >
        <span class="flex-1 min-w-0">{{ ref.message }}</span>
        <UButton
          v-if="canNavigate(ref)"
          size="xs"
          color="red"
          variant="soft"
          @click="navigateToDetection(ref)"
        >
          {{ t('raid.md_detection.view_in_raid_ui') }}
        </UButton>
      </div>
    </div>

    <!-- Warnings -->
    <div v-if="preflight.warnings.length" class="space-y-1.5">
      <p class="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Avertissements</p>
      <div
        v-for="w in preflight.warnings"
        :key="w"
        class="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
      >
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 shrink-0 mt-0.5 text-amber-500 dark:text-amber-400" />
        {{ w }}
      </div>
    </div>

    <!-- Devices impactés -->
    <div v-if="preflight.impactedDevices.length">
      <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">{{ t('raid.preflight.impacted_devices') }}</p>
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-for="d in preflight.impactedDevices"
          :key="d"
          :label="d"
          color="gray"
          variant="outline"
          size="xs"
          class="font-mono"
        />
      </div>
    </div>

    <!-- Vérification candidats MD -->
    <div v-if="preflight.candidateChecks?.length" class="space-y-1.5">
      <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{{ t('raid.preflight.md_member_candidates') }}</p>
      <div
        v-for="candidate in preflight.candidateChecks"
        :key="candidate.path"
        class="border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-xs"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="font-mono text-gray-700 dark:text-gray-300">{{ candidate.path }}</span>
          <UBadge
            :label="candidate.eligible ? t('raid.preflight.eligible') : t('raid.preflight.blocked')"
            :color="candidate.eligible ? 'green' : 'red'"
            size="xs"
            variant="soft"
          />
        </div>
        <div class="mt-1 text-gray-500 dark:text-gray-400">
          <span v-if="candidate.partitionTypeName || candidate.partitionType">
            Type : {{ candidate.partitionTypeName ?? candidate.partitionType }}
          </span>
          <span v-if="candidate.signatures?.length">
            Signatures : {{ candidate.signatures.join(', ') }}
          </span>
        </div>
        <ul v-if="candidate.reasons.length" class="mt-1 list-disc pl-4 text-red-600 dark:text-red-400">
          <li v-for="reason in candidate.reasons" :key="reason">{{ reason }}</li>
        </ul>
      </div>
    </div>

    <!-- Vérification disques préparation partitions MD -->
    <div v-if="preflight.diskChecks?.length" class="space-y-1.5">
      <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{{ t('raid.preflight.physical_disks_to_prepare') }}</p>
      <div
        v-for="disk in preflight.diskChecks"
        :key="disk.path"
        class="border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-xs"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="font-mono text-gray-700 dark:text-gray-300">{{ disk.path }}</span>
          <UBadge
            :label="disk.eligible ? t('raid.preflight.eligible') : t('raid.preflight.blocked')"
            :color="disk.eligible ? 'green' : 'red'"
            size="xs"
            variant="soft"
          />
        </div>
        <div class="mt-1 space-y-0.5 text-gray-500 dark:text-gray-400">
          <p>Taille : {{ formatSize(disk.sizeBytes) }}</p>
          <p v-if="disk.signatures.length">Signatures : {{ disk.signatures.join(', ') }}</p>
          <p v-if="disk.childrenPaths.length">Partitions existantes : {{ disk.childrenPaths.join(', ') }}</p>
          <p v-if="disk.willOverwritePartitionTable" class="text-amber-600 dark:text-amber-400">
            {{ t('raid.preflight.partition_table_replaced') }}
          </p>
          <p v-if="disk.expectedPartitionPath">{{ t('raid.preflight.expected_member_partition') }} : <span class="font-mono">{{ disk.expectedPartitionPath }}</span></p>
        </div>
        <ul v-if="disk.reasons.length" class="mt-1 list-disc pl-4 text-red-600 dark:text-red-400">
          <li v-for="reason in disk.reasons" :key="reason">{{ reason }}</li>
        </ul>
      </div>
    </div>

    <!-- OK sans blocage -->
    <div v-if="preflight.ok && !preflight.blockers.length" class="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
      <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
      Pré-requis validés — opération autorisée
    </div>

    <!-- Commande prévue -->
    <div v-if="preflight.commandPreview" class="bg-gray-100 dark:bg-gray-800 rounded px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
      Commande prévue :
      <code class="block mt-1 text-gray-800 dark:text-gray-100 font-mono break-all">{{ preflight.commandPreview }}</code>
    </div>

    <!-- Phrase de confirmation -->
    <div v-if="preflight.requiredConfirmation" class="bg-gray-100 dark:bg-gray-800 rounded px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
      Phrase de confirmation requise :
      <code class="text-amber-700 dark:text-amber-300 ml-1 font-mono">{{ preflight.requiredConfirmation }}</code>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PreflightBlockerRef, RaidPreflightResult } from '~/types/raid'
import {
  raidDetectionNavigateKey,
  type RaidDetectionNavigateFn,
} from '~/composables/useRaidDetectionNavigate'

const props = defineProps<{
  preflight: RaidPreflightResult
  onNavigateDetection?: RaidDetectionNavigateFn
}>()

const { t } = useEsosI18n()
const injectedNavigate = inject(raidDetectionNavigateKey, null)

function canNavigate(_ref: PreflightBlockerRef): boolean {
  return Boolean(props.onNavigateDetection ?? injectedNavigate)
}

function navigateToDetection(ref: PreflightBlockerRef) {
  const fn = props.onNavigateDetection ?? injectedNavigate
  fn?.(ref)
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}
</script>
