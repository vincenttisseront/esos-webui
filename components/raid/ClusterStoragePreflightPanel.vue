<template>
  <div class="space-y-3">
    <UAlert
      :title="preflight.ok ? t('raid.cluster_preflight.ok_title') : t('raid.cluster_preflight.blocked_title')"
      :description="preflight.ok ? t('raid.cluster_preflight.ok_description') : t('raid.cluster_preflight.blocked_description')"
      :color="preflight.ok ? 'green' : 'red'"
      :icon="preflight.ok ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
    />
    <UAlert
      :title="t('raid.cluster_preflight.cluster_write_title')"
      :description="t('raid.cluster_preflight.cluster_write_description')"
      color="amber"
      icon="i-heroicons-exclamation-triangle"
    />

    <div v-if="preflight.syncLimitations.length" class="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      <p class="font-semibold mb-1">{{ t('raid.cluster_preflight.sync_limits_title') }}</p>
      <ul class="list-disc pl-4 space-y-0.5">
        <li v-for="item in preflight.syncLimitations" :key="item">{{ item }}</li>
      </ul>
    </div>

    <div v-if="preflight.blockers.length" class="space-y-1">
      <p class="text-xs font-semibold text-red-600 uppercase tracking-wide">{{ t('raid.cluster_preflight.blockers_title') }}</p>
      <div
        v-for="blocker in preflight.blockers"
        :key="blocker"
        class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ blocker }}
      </div>
    </div>

    <div v-if="preflight.blockerRefs?.length" class="space-y-1">
      <div
        v-for="ref in preflight.blockerRefs"
        :key="`${ref.code}-${ref.path ?? ''}-${ref.sanId ?? ''}-${ref.message}`"
        class="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
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

    <div v-if="preflight.warnings.length" class="space-y-1">
      <p class="text-xs font-semibold text-amber-600 uppercase tracking-wide">{{ t('raid.cluster_preflight.warnings_title') }}</p>
      <div
        v-for="warning in preflight.warnings"
        :key="warning"
        class="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
      >
        {{ warning }}
      </div>
    </div>

    <div class="overflow-x-auto rounded border border-gray-200">
      <table class="w-full text-xs">
        <thead class="bg-gray-50 text-left text-gray-500 uppercase tracking-wide">
          <tr>
            <th class="px-3 py-2">{{ t('raid.cluster_preflight.table_node') }}</th>
            <th class="px-3 py-2">{{ t('raid.cluster_preflight.table_role') }}</th>
            <th class="px-3 py-2">{{ t('raid.cluster_preflight.table_ssh') }}</th>
            <th class="px-3 py-2">{{ t('raid.cluster_preflight.table_tools') }}</th>
            <th class="px-3 py-2">{{ t('raid.cluster_preflight.table_block_devices') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="node in preflight.nodes" :key="node.sanId" class="border-t border-gray-100">
            <td class="px-3 py-2 font-medium text-gray-800">{{ node.label }}</td>
            <td class="px-3 py-2 text-gray-600">{{ node.role ?? '—' }}</td>
            <td class="px-3 py-2" :class="node.sshReady ? 'text-green-600' : 'text-red-600'">
              {{ node.sshReady ? t('raid.cluster_preflight.ssh_connected') : t('raid.cluster_preflight.ssh_unavailable') }}
            </td>
            <td class="px-3 py-2 text-gray-600">
              <span v-if="node.tools">{{ t('raid.cluster_preflight.tools_line', { mdadm: node.tools.mdadm ? 'OK' : 'KO', parted: node.tools.parted ? 'OK' : 'KO', sfdisk: node.tools.sfdisk ? 'OK' : 'KO' }) }}</span>
              <span v-else>—</span>
            </td>
            <td class="px-3 py-2 text-gray-600">{{ node.blockDevices.length }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="preflight.mappings.length" class="overflow-x-auto rounded border border-gray-200">
      <table class="w-full text-xs">
        <thead class="bg-gray-50 text-left text-gray-500 uppercase tracking-wide">
          <tr>
            <th class="px-3 py-2">{{ t('raid.cluster_preflight.mapping_source') }}</th>
            <th class="px-3 py-2">{{ t('raid.cluster_preflight.mapping_target_node') }}</th>
            <th class="px-3 py-2">{{ t('raid.cluster_preflight.mapping_target') }}</th>
            <th class="px-3 py-2">{{ t('raid.cluster_preflight.mapping_confidence') }}</th>
            <th class="px-3 py-2">{{ t('raid.cluster_preflight.mapping_evidence') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="mapping in preflight.mappings" :key="`${mapping.targetSanId}-${mapping.sourcePath}`" class="border-t border-gray-100">
            <td class="px-3 py-2 font-mono">{{ mapping.sourcePath }}</td>
            <td class="px-3 py-2">{{ nodeLabel(mapping.targetSanId) }}</td>
            <td class="px-3 py-2 font-mono">{{ mapping.targetPath ?? '—' }}</td>
            <td class="px-3 py-2">
              <UBadge :color="confidenceColor(mapping.confidence)" :label="mapping.confidence" size="xs" variant="soft" />
            </td>
            <td class="px-3 py-2 text-gray-600">
              {{ mapping.evidence.join(', ') || mapping.blockers.join(', ') || mapping.warnings.join(', ') || '—' }}
              <span v-if="mapping.candidates?.length" class="block text-amber-600">
                {{ t('raid.cluster_preflight.mapping_manual_required', { count: mapping.candidates.length }) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  ClusterDiskMappingConfidence,
  ClusterStoragePreflightResult,
  PreflightBlockerRef,
} from '~/types/raid'
import {
  raidDetectionNavigateKey,
  type RaidDetectionNavigateFn,
} from '~/composables/useRaidDetectionNavigate'

const props = defineProps<{
  preflight: ClusterStoragePreflightResult
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

function nodeLabel(sanId: string): string {
  return props.preflight.nodes.find(n => n.sanId === sanId)?.label ?? sanId
}

function confidenceColor(confidence: ClusterDiskMappingConfidence): 'green' | 'yellow' | 'red' | 'gray' {
  if (confidence === 'high') return 'green'
  if (confidence === 'medium') return 'yellow'
  if (confidence === 'low') return 'yellow'
  return 'red'
}
</script>
