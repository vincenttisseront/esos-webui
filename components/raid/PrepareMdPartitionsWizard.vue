<template>
  <div class="bg-white rounded-xl shadow-modal w-full relative max-w-3xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden outline-none" role="dialog" :aria-modal="true">
    <div class="px-5 pt-5 pb-0 shrink-0">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-circle-stack" class="w-5 h-5 text-amber-500" />
        <h3 class="font-semibold text-gray-900">Étape {{ step + 1 }}/{{ steps.length }} — {{ t('raid.prepare_partitions.title') }}</h3>
      </div>
      <div class="flex gap-1 mt-3">
        <div
          v-for="(_s, i) in steps"
          :key="i"
          class="h-1 flex-1 rounded-full transition-colors"
          :class="i <= step ? 'bg-amber-500' : 'bg-gray-200'"
        />
      </div>
    </div>

    <div class="px-5 py-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div v-if="step === 0" class="space-y-4">
        <div class="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-1">
          <p class="font-semibold">{{ t('raid.workflow.title') }}</p>
          <ol class="list-decimal pl-4 space-y-0.5">
            <li>{{ t('raid.workflow.step_prepare') }}</li>
            <li>{{ t('raid.workflow.step_create') }}</li>
            <li>{{ t('raid.workflow.step_use') }}</li>
          </ol>
        </div>
        <UAlert
          :title="t('raid.prepare_partitions.destructive_title')"
          :description="t('raid.prepare_partitions.destructive_description')"
          color="amber"
          icon="i-heroicons-exclamation-triangle"
        />
        <p class="text-sm text-gray-600">
          {{ t('raid.prepare_partitions.physical_disk_selection_help') }}
        </p>
        <div class="space-y-1 max-h-72 overflow-y-auto">
          <label
            v-for="disk in eligibleDisks"
            :key="disk.path"
            class="flex items-start gap-3 px-3 py-2 rounded hover:bg-gray-50 cursor-pointer"
          >
            <input
              v-model="form.disks"
              type="checkbox"
              :value="disk.path"
              class="accent-amber-500 mt-1"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-mono text-sm text-gray-800">{{ disk.path }}</span>
                <span class="text-xs text-gray-500">{{ formatSize(disk.sizeBytes) }}</span>
                <span v-if="disk.model" class="text-xs text-gray-500 truncate">{{ disk.model }}</span>
              </div>
              <div class="text-xs text-gray-500 mt-0.5">
                <span v-if="disk.diskSignatures?.length">Signatures : {{ disk.diskSignatures.join(', ') }}</span>
                <span v-if="disk.childrenPaths?.length"> Partitions : {{ disk.childrenPaths.join(', ') }}</span>
                <span v-if="!disk.diskSignatures?.length && !disk.childrenPaths?.length">Aucune signature détectée</span>
              </div>
            </div>
          </label>
        </div>
        <p v-if="!eligibleDisks.length" class="text-xs text-amber-600">
          {{ t('raid.prepare_partitions.no_eligible_physical_disks') }}
        </p>
      </div>

      <div v-else-if="step === 1" class="space-y-4">
        <UFormGroup :label="t('raid.prepare_partitions.partition_table.label')">
          <select
            v-model="form.partitionTable"
            class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option v-for="option in partitionTableOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </UFormGroup>
        <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
          <div class="flex items-center gap-2 font-semibold">
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4 shrink-0" />
            <span>{{ t('raid.prepare_partitions.partition_table.selected') }} : {{ selectedPartitionTableOption?.label }}</span>
          </div>
          <p>{{ selectedPartitionTableOption?.description }}</p>
        </div>
        <label class="flex items-start gap-3 cursor-pointer select-none">
          <input v-model="form.allowOverwriteSignatures" type="checkbox" class="mt-0.5 accent-red-500" />
          <span class="text-sm text-gray-600">
            {{ t('raid.prepare_partitions.allow_overwrite_label') }}
          </span>
        </label>
        <div class="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
          <p v-for="disk in selectedDisks" :key="disk.path">
            <span class="font-mono">{{ disk.path }}</span> — {{ formatSize(disk.sizeBytes) }}
            <span v-if="disk.diskSignatures?.length"> — signatures : {{ disk.diskSignatures.join(', ') }}</span>
            <span v-if="disk.childrenPaths?.length"> — partitions : {{ disk.childrenPaths.join(', ') }}</span>
          </p>
        </div>
      </div>

      <div v-else-if="step === 2" class="space-y-3">
        <div v-if="preflightLoading" class="text-sm text-gray-500 flex items-center gap-2 py-4">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
          Analyse en cours…
        </div>
        <RaidPreflightPanel v-else-if="preflightResult" :preflight="preflightResult" :on-navigate-detection="props.onNavigateDetection" />
        <div v-if="preflightResult" class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 space-y-1">
          <p>
            <span class="font-semibold">{{ t('raid.prepare_partitions.partition_table.selected') }} :</span>
            {{ partitionTableLabel(preflightResult.partitionTableRequested ?? form.partitionTable) }}
          </p>
          <p v-if="preflightResult.partitionTableResolved">
            <span class="font-semibold">{{ t('raid.prepare_partitions.partition_table.resolved') }} :</span>
            {{ partitionTableLabel(preflightResult.partitionTableResolved) }}
          </p>
        </div>
        <div v-if="clusterPreflightLoading" class="text-sm text-gray-500 flex items-center gap-2 py-2">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
          Préflight stockage cluster en cours…
        </div>
        <ClusterStoragePreflightPanel v-else-if="clusterPreflightResult" :preflight="clusterPreflightResult" :on-navigate-detection="props.onNavigateDetection" />
        <div v-if="ambiguousMappings.length" class="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
          <div class="space-y-1">
            <p class="text-sm font-semibold text-amber-900">{{ t('raid.prepare_partitions.mapping.title') }}</p>
            <p class="text-xs text-amber-800">{{ t('raid.prepare_partitions.mapping.description') }}</p>
          </div>
          <div
            v-for="mapping in ambiguousMappings"
            :key="mappingKey(mapping)"
            class="rounded border border-amber-200 bg-white p-3 space-y-2"
          >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <p class="font-semibold text-gray-700">{{ t('raid.prepare_partitions.mapping.source_disk') }}</p>
                <p class="font-mono text-gray-900">{{ mapping.sourcePath }}</p>
                <p class="text-gray-500">{{ deviceSummary(sourceDevice(mapping.sourcePath)) }}</p>
              </div>
              <div>
                <p class="font-semibold text-gray-700">{{ t('raid.prepare_partitions.mapping.peer_disk') }} — {{ nodeLabel(mapping.targetSanId) }}</p>
                <select
                  v-model="manualDiskMappingSelection[mappingKey(mapping)]"
                  class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">{{ t('raid.prepare_partitions.mapping.select_placeholder') }}</option>
                  <option
                    v-for="candidate in mapping.candidates"
                    :key="candidate.path"
                    :value="candidate.path"
                  >
                    {{ candidateLabel(mapping.targetSanId, candidate.path, candidate.confidence) }}
                  </option>
                </select>
                <p v-if="duplicateMappingKeys.has(mappingKey(mapping))" class="mt-1 text-xs text-red-600">
                  {{ t('raid.prepare_partitions.mapping.duplicate_target') }}
                </p>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3">
            <p v-if="!manualMappingComplete" class="text-xs text-amber-800">
              {{ t('raid.prepare_partitions.mapping.incomplete') }}
            </p>
            <p v-else-if="duplicateMappingKeys.size" class="text-xs text-red-600">
              {{ t('raid.prepare_partitions.mapping.duplicate_target') }}
            </p>
            <p v-else class="text-xs text-green-700">
              {{ t('raid.prepare_partitions.mapping.ready') }}
            </p>
            <UButton
              color="amber"
              size="xs"
              icon="i-heroicons-arrow-path"
              :loading="clusterPreflightLoading"
              :disabled="!canRerunClusterPreflightWithMappings"
              @click="rerunClusterPreflightWithMappings"
            >
              {{ t('raid.prepare_partitions.mapping.rerun') }}
            </UButton>
          </div>
        </div>
        <UAlert
          v-if="clusterPreflightError"
          title="Préflight stockage cluster échoué"
          :description="clusterPreflightError"
          color="red"
          icon="i-heroicons-x-circle"
        />
        <UAlert
          v-else-if="clusterPreflightState === 'unavailable'"
          title="Préflight stockage cluster indisponible"
          description="Le préflight local est validé, mais le préflight cluster n'a pas retourné de résultat. La suite reste bloquée pour éviter une écriture sur un seul nœud."
          color="amber"
          icon="i-heroicons-exclamation-triangle"
        />
        <div v-if="!isClustered && preflightResult?.commandPreview" class="space-y-1">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Commandes prévues</p>
          <pre class="text-xs bg-gray-50 border border-gray-200 rounded p-3 max-h-64 overflow-auto font-mono text-gray-700">{{ preflightResult.commandPreview }}</pre>
        </div>
        <div v-if="isClustered && perNodeCommandPreviews.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.prepare_partitions.cluster_execution.per_node_commands') }}</p>
          <div
            v-for="node in perNodeCommandPreviews"
            :key="node.sanId"
            class="rounded border border-gray-200 bg-gray-50 p-3 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-gray-800">{{ node.label }}</p>
              <UBadge :label="node.role ?? node.source" color="gray" variant="soft" size="xs" />
            </div>
            <pre class="text-xs bg-white border border-gray-200 rounded p-3 max-h-48 overflow-auto font-mono text-gray-700">{{ node.commandPreview }}</pre>
          </div>
        </div>
        <UAlert
          v-if="preflightResult && !preflightResult.ok"
          title="Opération bloquée"
          description="Corrigez les blocages ci-dessus avant de continuer."
          color="red"
          icon="i-heroicons-x-circle"
        />
      </div>

      <div v-else-if="step === 3" class="space-y-4">
        <RaidPreflightPanel v-if="preflightResult" :preflight="preflightResult" :on-navigate-detection="props.onNavigateDetection" />
        <div v-if="preflightResult" class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 space-y-1">
          <p>
            <span class="font-semibold">{{ t('raid.prepare_partitions.partition_table.selected') }} :</span>
            {{ partitionTableLabel(preflightResult.partitionTableRequested ?? form.partitionTable) }}
          </p>
          <p v-if="preflightResult.partitionTableResolved">
            <span class="font-semibold">{{ t('raid.prepare_partitions.partition_table.resolved') }} :</span>
            {{ partitionTableLabel(preflightResult.partitionTableResolved) }}
          </p>
        </div>
        <ClusterStoragePreflightPanel v-if="clusterPreflightResult" :preflight="clusterPreflightResult" :on-navigate-detection="props.onNavigateDetection" />
        <UAlert
          v-if="isClustered"
          :title="t('raid.prepare_partitions.cluster_execution.title')"
          :description="t('raid.prepare_partitions.cluster_execution.description')"
          color="red"
          icon="i-heroicons-bolt"
        />
        <div v-if="!isClustered && preflightResult?.commandPreview" class="space-y-1">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Commandes prévues</p>
          <pre class="text-xs bg-gray-50 border border-gray-200 rounded p-3 max-h-64 overflow-auto font-mono text-gray-700">{{ preflightResult.commandPreview }}</pre>
        </div>
        <div v-if="isClustered && perNodeCommandPreviews.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.prepare_partitions.cluster_execution.per_node_commands') }}</p>
          <div
            v-for="node in perNodeCommandPreviews"
            :key="node.sanId"
            class="rounded border border-gray-200 bg-gray-50 p-3 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-gray-800">{{ node.label }}</p>
              <UBadge :label="node.role ?? node.source" color="gray" variant="soft" size="xs" />
            </div>
            <pre class="text-xs bg-white border border-gray-200 rounded p-3 max-h-48 overflow-auto font-mono text-gray-700">{{ node.commandPreview }}</pre>
          </div>
        </div>
        <div v-if="executionNodePlans.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.prepare_partitions.cluster_execution.status_title') }}</p>
          <div
            v-for="node in executionNodePlans"
            :key="node.sanId"
            class="flex items-center justify-between gap-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
          >
            <div>
              <p class="font-semibold text-gray-800">{{ node.label }}</p>
              <p v-if="node.error" class="text-xs text-red-600">{{ node.error }}</p>
              <p v-else class="text-xs text-gray-500">{{ node.disks.join(', ') }}</p>
            </div>
            <UBadge :color="nodeStatusColor(node.status)" :label="nodeStatusLabel(node.status)" variant="soft" size="xs" />
          </div>
        </div>
        <div class="space-y-2">
          <p class="text-sm text-gray-600">
            Saisissez exactement
            <code class="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-mono text-xs">
              {{ confirmationPhrase }}
            </code>
            pour confirmer :
          </p>
          <UInput v-model="form.confirmation" class="font-mono" @paste.prevent />
        </div>
        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="understood" type="checkbox" class="mt-0.5 accent-red-500" />
          <span class="text-sm text-gray-600">
            Je comprends que les tables de partitions et données existantes des disques sélectionnés peuvent être perdues.
          </span>
        </label>
        <p v-if="submitError" class="text-sm text-red-600">{{ submitError }}</p>
      </div>

      <div v-else class="space-y-4">
        <UAlert
          :title="t('raid.prepare_partitions.done_title')"
          :description="t('raid.prepare_partitions.done_description')"
          color="green"
          icon="i-heroicons-check-circle"
        />
        <div v-if="result?.preparedPartitions?.length" class="space-y-1">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.prepare_partitions.expected_member_partitions') }}</p>
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="part in result.preparedPartitions"
              :key="part"
              :label="part"
              color="green"
              variant="soft"
              size="xs"
              class="font-mono"
            />
          </div>
        </div>
        <div v-if="result?.clusterExecution?.nodePlans?.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.prepare_partitions.cluster_execution.result_title') }}</p>
          <div
            v-for="node in result.clusterExecution.nodePlans"
            :key="node.sanId"
            class="rounded border border-gray-200 bg-gray-50 p-3 space-y-2"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-800">{{ node.label }}</p>
                <p class="text-xs text-gray-500">{{ node.preparedPartitions.join(', ') }}</p>
              </div>
              <UBadge :color="nodeStatusColor(node.status)" :label="nodeStatusLabel(node.status)" variant="soft" size="xs" />
            </div>
            <p v-if="node.error" class="text-xs text-red-600">{{ node.error }}</p>
          </div>
          <p class="text-xs text-green-700">{{ t('raid.prepare_partitions.cluster_execution.partitions_visible') }}</p>
        </div>
      </div>
    </div>

    <div class="px-5 py-4 border-t border-gray-100 bg-white shrink-0 flex justify-between">
      <UButton
        color="gray"
        variant="ghost"
        :disabled="busy"
        @click="handleBackOrCancel"
      >
        {{ step === 0 || step === 4 ? 'Fermer' : 'Retour' }}
      </UButton>
      <div class="flex gap-2">
        <UButton
          v-if="step === 4"
          color="blue"
          icon="i-heroicons-server-stack"
          @click="$emit('confirm', true)"
        >
          {{ t('raid.prepare_partitions.continue_to_md') }}
        </UButton>
        <UButton
          v-else-if="step < 3"
          color="amber"
          :disabled="!canNext || busy"
          @click="handleNext"
        >
          Suivant
        </UButton>
        <UButton
          v-else
          color="red"
          :disabled="!canSubmit || busy"
          :loading="busy"
          icon="i-heroicons-bolt"
          @click="submit"
        >
          {{ t('raid.prepare_partitions.submit') }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  ClusterDiskMapping,
  ClusterDiskMappingInput,
  ClusterStoragePreflightResult,
  PrepareMdPartitionsNodePlan,
  PrepareMdPartitionsResponse,
  RaidBlockDevice,
  RaidPreflightResult,
} from '~/types/raid'
import { buildPreparedClusterMappingHint } from '~/utils/raid-cluster-mapping'
import type { RaidDetectionNavigateFn } from '~/composables/useRaidDetectionNavigate'

const props = defineProps<{
  blockDevices: RaidBlockDevice[]
  sourceSanId?: string
  clusterId?: string | null
  onNavigateDetection?: RaidDetectionNavigateFn
}>()

const emit = defineEmits<{
  confirm: [continueToMd?: boolean]
  cancel: []
}>()

const raid = useRaidStore()
const { t } = useEsosI18n()
const steps = ['Disques', 'Options', 'Pré-vérification', 'Confirmation', 'Terminé']
const confirmationPhrase = 'CREATE RAID PARTITIONS'
const step = ref(0)
const busy = ref(false)
const understood = ref(false)
const submitError = ref<string | null>(null)
const preflightResult = ref<RaidPreflightResult | null>(null)
const clusterPreflightResult = ref<ClusterStoragePreflightResult | null>(null)
const preflightLoading = ref(false)
const clusterPreflightLoading = ref(false)
const clusterPreflightError = ref<string | null>(null)
const result = ref<PrepareMdPartitionsResponse | null>(null)
const executionNodePlans = ref<PrepareMdPartitionsNodePlan[]>([])
const lastClusterDiskMappings = ref<ClusterDiskMappingInput[]>([])
const manualDiskMappingSelection = reactive<Record<string, string>>({})

const form = reactive({
  disks: [] as string[],
  partitionTable: 'gpt' as 'auto' | 'gpt' | 'dos',
  allowOverwriteSignatures: false,
  confirmation: '',
})

const partitionTableOptions = computed(() => [
  {
    label: t('raid.prepare_partitions.partition_table.gpt_label'),
    description: t('raid.prepare_partitions.partition_table.gpt_description'),
    value: 'gpt' as const,
  },
  {
    label: t('raid.prepare_partitions.partition_table.dos_label'),
    description: t('raid.prepare_partitions.partition_table.dos_description'),
    value: 'dos' as const,
  },
  {
    label: t('raid.prepare_partitions.partition_table.auto_label'),
    description: t('raid.prepare_partitions.partition_table.auto_description'),
    value: 'auto' as const,
  },
])

const selectedPartitionTableOption = computed(() =>
  partitionTableOptions.value.find(option => option.value === form.partitionTable),
)

function partitionTableLabel(value: 'auto' | 'gpt' | 'dos'): string {
  const option = partitionTableOptions.value.find(item => item.value === value)
  return option?.label ?? value
}

const eligibleDisks = computed(() =>
  props.blockDevices.filter(d => d.eligibleForMdPartitionPrep),
)

const selectedDisks = computed(() =>
  props.blockDevices.filter(d => form.disks.includes(d.path)),
)
const isClustered = computed(() => Boolean(props.clusterId && props.sourceSanId))
const ambiguousMappings = computed(() =>
  (clusterPreflightResult.value?.mappings ?? []).filter(mapping =>
    mapping.confidence === 'none' && (mapping.candidates?.length ?? 0) > 0,
  ),
)
const manualMappingInputs = computed(() =>
  ambiguousMappings.value
    .map(mapping => ({
      sourcePath: mapping.sourcePath,
      targetSanId: mapping.targetSanId,
      targetPath: manualDiskMappingSelection[mappingKey(mapping)] ?? '',
    }))
    .filter(mapping => mapping.targetPath),
)
const manualMappingComplete = computed(() =>
  ambiguousMappings.value.length > 0
  && ambiguousMappings.value.every(mapping => Boolean(manualDiskMappingSelection[mappingKey(mapping)])),
)
const duplicateMappingKeys = computed(() => {
  const byPeerTarget = new Map<string, string[]>()
  for (const mapping of ambiguousMappings.value) {
    const targetPath = manualDiskMappingSelection[mappingKey(mapping)]
    if (!targetPath) continue
    const key = `${mapping.targetSanId}:${targetPath}`
    byPeerTarget.set(key, [...(byPeerTarget.get(key) ?? []), mappingKey(mapping)])
  }
  return new Set(
    [...byPeerTarget.values()]
      .filter(keys => keys.length > 1)
      .flat(),
  )
})
const canRerunClusterPreflightWithMappings = computed(() =>
  manualMappingComplete.value && duplicateMappingKeys.value.size === 0 && !clusterPreflightLoading.value,
)
const perNodeCommandPreviews = computed(() => {
  const preflight = clusterPreflightResult.value
  if (!preflight?.ok) return []
  return preflight.nodes
    .map((node) => {
      const nodePreflight = preflight.perNodePreflights[node.sanId]
      return {
        sanId: node.sanId,
        label: node.label,
        role: node.role,
        source: node.sanId === preflight.sourceSanId ? 'primary' : 'peer',
        commandPreview: nodePreflight?.commandPreview ?? '',
      }
    })
    .filter(node => node.commandPreview)
})
const clusterPreflightState = computed<'not_clustered' | 'pending' | 'ok' | 'failed' | 'unavailable'>(() => {
  if (!isClustered.value) return 'not_clustered'
  if (clusterPreflightLoading.value) return 'pending'
  if (clusterPreflightError.value) return 'failed'
  if (clusterPreflightResult.value?.ok) return 'ok'
  if (preflightResult.value?.ok) return 'unavailable'
  return 'pending'
})

const canNext = computed(() => {
  if (step.value === 0) return form.disks.length > 0
  if (step.value === 2) return !!preflightResult.value?.ok && (!isClustered.value || clusterPreflightState.value === 'ok')
  return true
})

const canSubmit = computed(() =>
  understood.value
  && preflightResult.value?.ok
  && (!isClustered.value || clusterPreflightState.value === 'ok')
  && form.confirmation === confirmationPhrase,
)

async function handleNext() {
  step.value++
  if (step.value === 2) await runPreflight()
}

function handleBackOrCancel() {
  if (step.value === 0) return emit('cancel')
  if (step.value === 4) return emit('confirm', false)
  step.value--
}

async function runPreflight() {
  preflightLoading.value = true
  clusterPreflightLoading.value = false
  clusterPreflightResult.value = null
  clusterPreflightError.value = null
  executionNodePlans.value = []
  lastClusterDiskMappings.value = []
  result.value = null
  clearManualDiskMappings()
  const payload = {
    disks: form.disks,
    partitionTable: form.partitionTable,
    allowOverwriteSignatures: form.allowOverwriteSignatures,
  }
  try {
    preflightResult.value = await raid.preflight({
      backend: 'software_md',
      action: 'prepare_md_partitions',
      payload,
    })
    if (isClustered.value) {
      await runClusterPreflight(payload)
    }
    form.confirmation = ''
  } catch (err: any) {
    if (preflightResult.value) clusterPreflightError.value = err?.data?.statusMessage ?? err.message ?? 'Préflight stockage cluster indisponible'
    else preflightResult.value = null
  } finally {
    preflightLoading.value = false
    clusterPreflightLoading.value = false
  }
}

async function rerunClusterPreflightWithMappings() {
  const payload = {
    disks: form.disks,
    partitionTable: form.partitionTable,
    allowOverwriteSignatures: form.allowOverwriteSignatures,
  }
  await runClusterPreflight(payload, manualMappingInputs.value)
}

async function runClusterPreflight(payload: Record<string, unknown>, diskMappings = manualMappingInputs.value) {
  clusterPreflightLoading.value = true
  clusterPreflightError.value = null
  try {
    clusterPreflightResult.value = await raid.clusterStoragePreflight({
      clusterId: props.clusterId ?? undefined,
      primarySanId: props.sourceSanId!,
      action: 'prepare_md_partitions',
      payload,
      diskMappings,
    })
    lastClusterDiskMappings.value = [...diskMappings]
  } catch (err: any) {
    clusterPreflightError.value = err?.data?.statusMessage ?? err.message ?? 'Préflight stockage cluster indisponible'
  } finally {
    clusterPreflightLoading.value = false
  }
}

async function submit() {
  busy.value = true
  submitError.value = null
  result.value = null
  if (isClustered.value) {
    executionNodePlans.value = buildPendingExecutionNodePlans()
    if (executionNodePlans.value[0]) executionNodePlans.value[0].status = 'running'
  }
  try {
    result.value = await raid.prepareMdPartitions({
      disks: form.disks,
      partitionTable: form.partitionTable,
      allowOverwriteSignatures: form.allowOverwriteSignatures,
      confirmation: form.confirmation,
      clusterExecution: isClustered.value
        ? {
            clusterId: props.clusterId ?? undefined,
            primarySanId: props.sourceSanId!,
            diskMappings: lastClusterDiskMappings.value,
            requirePreflightOk: true,
            stopOnFirstFailure: true,
          }
        : undefined,
    })
    executionNodePlans.value = result.value.clusterExecution?.nodePlans ?? []
    if (isClustered.value) rememberClusterMappingHint()
    step.value = 4
  } catch (err: any) {
    submitError.value = err?.data?.statusMessage ?? err.message ?? 'Erreur lors de la préparation'
    const failedExecution = err?.data?.data?.clusterExecution ?? err?.data?.clusterExecution
    if (failedExecution?.nodePlans) executionNodePlans.value = failedExecution.nodePlans
  } finally {
    busy.value = false
  }
}

function rememberClusterMappingHint(): void {
  const resolvedMappings = (clusterPreflightResult.value?.mappings ?? [])
    .filter((mapping): mapping is ClusterDiskMapping & { targetPath: string } => Boolean(mapping.targetPath))
    .map(mapping => ({
      sourcePath: mapping.sourcePath,
      targetSanId: mapping.targetSanId,
      targetPath: mapping.targetPath,
    }))
  if (!props.sourceSanId || resolvedMappings.length === 0) return
  raid.rememberPreparedClusterMappings(buildPreparedClusterMappingHint({
    sourceSanId: props.sourceSanId,
    clusterId: props.clusterId,
    sourceDisks: form.disks,
    diskMappings: resolvedMappings,
  }))
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}

function mappingKey(mapping: Pick<ClusterDiskMapping, 'sourcePath' | 'targetSanId'>): string {
  return `${mapping.targetSanId}::${mapping.sourcePath}`
}

function buildPendingExecutionNodePlans(): PrepareMdPartitionsNodePlan[] {
  const preflight = clusterPreflightResult.value
  if (!preflight) return []
  return preflight.nodes.map((node) => {
    const nodePreflight = preflight.perNodePreflights[node.sanId]
    const mappedDisks = node.sanId === preflight.sourceSanId
      ? form.disks
      : form.disks.map(sourcePath =>
          preflight.mappings.find(mapping => mapping.sourcePath === sourcePath && mapping.targetSanId === node.sanId)?.targetPath ?? sourcePath,
        )
    return {
      sanId: node.sanId,
      label: node.label,
      role: node.role,
      source: node.sanId === preflight.sourceSanId ? 'primary' : 'peer',
      disks: mappedDisks,
      commands: nodePreflight?.commandPreview?.split('\n').filter(Boolean) ?? [],
      preparedPartitions: nodePreflight?.preparedPartitionPreview?.map(part => part.expectedPartitionPath) ?? [],
      preflight: nodePreflight ?? preflightResult.value!,
      status: 'pending',
    }
  })
}

function nodeStatusColor(status: PrepareMdPartitionsNodePlan['status']): 'gray' | 'blue' | 'green' | 'red' {
  if (status === 'running') return 'blue'
  if (status === 'success') return 'green'
  if (status === 'failed') return 'red'
  return 'gray'
}

function nodeStatusLabel(status: PrepareMdPartitionsNodePlan['status']): string {
  return t(`raid.prepare_partitions.cluster_execution.status.${status}`)
}

function clearManualDiskMappings() {
  for (const key of Object.keys(manualDiskMappingSelection)) delete manualDiskMappingSelection[key]
}

function sourceDevice(path: string): RaidBlockDevice | undefined {
  return props.blockDevices.find(device => device.path === path)
}

function nodeLabel(sanId: string): string {
  return clusterPreflightResult.value?.nodes.find(node => node.sanId === sanId)?.label ?? sanId
}

function peerDevice(sanId: string, path: string): RaidBlockDevice | undefined {
  return clusterPreflightResult.value?.nodes
    .find(node => node.sanId === sanId)
    ?.blockDevices.find(device => device.path === path)
}

function candidateLabel(sanId: string, path: string, confidence: string): string {
  return `${path} — ${deviceSummary(peerDevice(sanId, path))} — ${confidence}`
}

function deviceSummary(device?: RaidBlockDevice): string {
  if (!device) return '—'
  const ids = [
    formatSize(device.sizeBytes),
    device.model,
    device.serial ? `serial ${device.serial}` : undefined,
    device.wwn ? `wwn ${device.wwn}` : undefined,
    device.byIdPaths?.[0],
  ].filter(Boolean)
  return ids.join(' · ')
}
</script>
