<template>
  <div class="bg-white rounded-xl shadow-modal w-full relative max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden outline-none" role="dialog" :aria-modal="true">
    <!-- Header -->
    <div class="px-5 pt-5 pb-0 shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-server-stack" class="w-5 h-5 text-blue-500" />
          <h3 class="font-semibold text-gray-900">Étape {{ step + 1 }}/{{ steps.length }} — {{ t('raid.create_md.title') }}</h3>
        </div>
      </div>
      <!-- Stepper -->
      <div class="flex gap-1 mt-3">
        <div
          v-for="(s, i) in steps"
          :key="i"
          class="h-1 flex-1 rounded-full transition-colors"
          :class="i <= step ? 'bg-blue-500' : 'bg-gray-200'"
        />
      </div>
    </div>

    <!-- Corps -->
    <div class="px-5 py-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <!-- Étape 0 : Sélection des partitions -->
      <div v-if="step === 0" class="space-y-4">
        <div class="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-1">
          <p class="font-semibold">{{ t('raid.workflow.title') }}</p>
          <ol class="list-decimal pl-4 space-y-0.5">
            <li>{{ t('raid.workflow.step_prepare') }}</li>
            <li>{{ t('raid.workflow.step_create') }}</li>
            <li>{{ t('raid.workflow.step_use') }}</li>
          </ol>
        </div>
        <p class="text-sm text-gray-600">
          {{ t('raid.create_md.member_selection_help') }}
        </p>
        <div class="space-y-1 max-h-72 overflow-y-auto">
          <label
            v-for="dev in eligibleDevices"
            :key="dev.path"
            class="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-50 cursor-pointer"
          >
            <input
              type="checkbox"
              :value="dev.path"
              v-model="form.devices"
              class="accent-blue-500"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-mono text-sm text-gray-700">{{ dev.path }}</span>
                <span class="text-xs text-gray-500">{{ formatSize(dev.sizeBytes) }}</span>
                <span v-if="dev.partitionTypeName || dev.partitionTypeCode" class="text-xs text-gray-500">
                  {{ dev.partitionTypeName ?? dev.partitionTypeCode }}
                </span>
                <span v-if="dev.model" class="text-xs text-gray-500 truncate">{{ dev.model }}</span>
              </div>
            </div>
          </label>
        </div>
        <p v-if="!eligibleDevices.length" class="text-xs text-amber-600">
          {{ t('raid.create_md.no_eligible_members') }}
        </p>
        <p v-else class="text-xs text-gray-500">
          Sélectionnées : {{ form.devices.length }}
        </p>
      </div>

      <!-- Étape 1 : Nom + Niveau -->
      <div v-else-if="step === 1" class="space-y-4">
        <div>
          <h4 class="text-sm font-semibold text-gray-900">{{ t('raid.create_md.form.step_title') }}</h4>
          <p class="text-sm text-gray-500 mt-1">{{ t('raid.create_md.form.step_description') }}</p>
        </div>

        <UFormGroup
          :label="t('raid.create_md.form.array_name_label')"
          :hint="t('raid.create_md.form.array_name_help')"
          required
          :error="nameError"
        >
          <UInput v-model="form.name" placeholder="md0" class="font-mono" />
        </UFormGroup>

        <UFormGroup
          :label="t('raid.create_md.form.raid_level_label')"
          :hint="t('raid.create_md.form.raid_level_help')"
          required
        >
          <select
            v-model="form.level"
            class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option v-for="option in levelOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </UFormGroup>

        <UFormGroup
          :label="t('raid.create_md.form.chunk_label')"
          :hint="t('raid.create_md.form.chunk_help')"
        >
          <select
            v-model.number="form.chunkKb"
            class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option v-for="option in chunkOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </UFormGroup>

        <div class="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-1">
          <p>{{ t('raid.create_md.form.final_path', { name: form.name || 'mdX' }) }}</p>
          <p>{{ t('raid.create_md.form.selected_count', { count: form.devices.length }) }}</p>
          <p v-if="form.devices.length < minDevices" class="text-amber-700 font-medium">
            {{ t('raid.create_md.form.min_devices_error', { level: form.level, min: minDevices, count: form.devices.length }) }}
          </p>
          <p v-if="raid10EvenError" class="text-amber-700 font-medium">
            {{ t('raid.create_md.form.raid10_even_error') }}
          </p>
        </div>
      </div>

      <!-- Étape 2 : Pré-vérification -->
      <div v-else-if="step === 2" class="space-y-3">
        <div v-if="preflightLoading" class="text-sm text-gray-500 flex items-center gap-2 py-4">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
          Analyse en cours…
        </div>
        <RaidPreflightPanel v-else-if="preflightResult" :preflight="preflightResult" :on-navigate-detection="props.onNavigateDetection" />
        <div v-if="preflightResult?.commandPreview" class="space-y-1">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Commande prévue</p>
          <pre class="text-xs bg-gray-50 border border-gray-200 rounded p-3 max-h-64 overflow-auto font-mono text-gray-700">{{ preflightResult.commandPreview }}</pre>
        </div>
        <div v-if="clusterPreflightLoading" class="text-sm text-gray-500 flex items-center gap-2 py-2">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
          Préflight stockage cluster en cours…
        </div>
        <ClusterStoragePreflightPanel v-else-if="clusterPreflightResult" :preflight="clusterPreflightResult" :on-navigate-detection="props.onNavigateDetection" />
        <CreateMdPeerCleanupPanel
          v-if="isClustered && clusterPreflightResult && peerSuperblockCleanupGroups.length"
          :preflight="clusterPreflightResult"
          :primary-san-id="props.sourceSanId!"
          :source-devices="form.devices"
          :disabled="clusterPreflightLoading || preflightLoading"
          @cleaned="onPeerSuperblockCleanupDone"
        />
        <div v-if="executionPlanRows.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.create_md.execution_plan.title') }}</p>
          <div
            v-for="node in executionPlanRows"
            :key="node.sanId"
            class="rounded border border-gray-200 bg-gray-50 p-3 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-gray-800">{{ node.label }} <span class="font-mono text-xs text-gray-500">({{ node.sanId }})</span></p>
                <p class="text-xs text-gray-500">{{ node.devices.join(', ') || mdEmptyMembersMessage }}</p>
              </div>
              <UBadge :label="node.role ?? node.source" color="gray" variant="soft" size="xs" />
            </div>
            <pre v-if="node.command" class="text-xs bg-white border border-gray-200 rounded p-3 max-h-48 overflow-auto font-mono text-gray-700">{{ node.command }}</pre>
            <p v-else class="text-xs text-red-600">{{ mdEmptyMembersMessage }}</p>
          </div>
        </div>
        <UAlert
          v-if="executionPlanError"
          :title="t('raid.create_md.execution_plan.invalid_title')"
          :description="executionPlanError"
          color="red"
          icon="i-heroicons-x-circle"
        />
        <UAlert
          v-if="reusedPartitionMappings.length"
          :title="t('raid.create_md.mapping.reused_title')"
          :description="t('raid.create_md.mapping.reused_description', { count: reusedPartitionMappings.length })"
          color="green"
          icon="i-heroicons-link"
        />
        <div v-if="ambiguousMappings.length" class="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
          <div class="space-y-1">
            <p class="text-sm font-semibold text-amber-900">{{ t('raid.create_md.mapping.title') }}</p>
            <p class="text-xs text-amber-800">{{ t('raid.create_md.mapping.description') }}</p>
          </div>
          <div
            v-for="mapping in ambiguousMappings"
            :key="mappingKey(mapping)"
            class="rounded border border-amber-200 bg-white p-3 space-y-2"
          >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <p class="font-semibold text-gray-700">{{ t('raid.create_md.mapping.source_partition') }}</p>
                <p class="font-mono text-gray-900">{{ mapping.sourcePath }}</p>
                <p class="text-gray-500">{{ deviceSummary(sourceDevice(mapping.sourcePath)) }}</p>
              </div>
              <div>
                <p class="font-semibold text-gray-700">{{ t('raid.create_md.mapping.peer_partition') }} — {{ nodeLabel(mapping.targetSanId) }}</p>
                <select
                  v-model="manualPartitionMappingSelection[mappingKey(mapping)]"
                  class="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{{ t('raid.create_md.mapping.select_placeholder') }}</option>
                  <option
                    v-for="candidate in mapping.candidates"
                    :key="candidate.path"
                    :value="candidate.path"
                  >
                    {{ candidateLabel(mapping.targetSanId, candidate.path, candidate.confidence) }}
                  </option>
                </select>
                <p v-if="duplicateMappingKeys.has(mappingKey(mapping))" class="mt-1 text-xs text-red-600">
                  {{ t('raid.create_md.mapping.duplicate_target') }}
                </p>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3">
            <p v-if="!manualMappingComplete" class="text-xs text-amber-800">
              {{ t('raid.create_md.mapping.incomplete') }}
            </p>
            <p v-else-if="duplicateMappingKeys.size" class="text-xs text-red-600">
              {{ t('raid.create_md.mapping.duplicate_target') }}
            </p>
            <p v-else class="text-xs text-green-700">
              {{ t('raid.create_md.mapping.ready') }}
            </p>
            <UButton
              color="blue"
              size="xs"
              icon="i-heroicons-arrow-path"
              :loading="clusterPreflightLoading"
              :disabled="!canRerunClusterPreflightWithMappings"
              @click="rerunClusterPreflightWithMappings"
            >
              {{ t('raid.create_md.mapping.rerun') }}
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
        <UAlert
          v-if="preflightResult && !preflightResult.ok"
          title="Opération bloquée"
          description="Corrigez les erreurs ci-dessus avant de continuer."
          color="red"
          icon="i-heroicons-x-circle"
        />
      </div>

      <!-- Étape 3 : Confirmation -->
      <div v-else-if="step === 3" class="space-y-4">
        <RaidPreflightPanel v-if="preflightResult" :preflight="preflightResult" :on-navigate-detection="props.onNavigateDetection" />
        <div v-if="preflightResult?.commandPreview" class="space-y-1">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Commande prévue</p>
          <pre class="text-xs bg-gray-50 border border-gray-200 rounded p-3 max-h-64 overflow-auto font-mono text-gray-700">{{ preflightResult.commandPreview }}</pre>
        </div>
        <ClusterStoragePreflightPanel v-if="clusterPreflightResult" :preflight="clusterPreflightResult" :on-navigate-detection="props.onNavigateDetection" />
        <div v-if="executionPlanRows.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.create_md.execution_plan.title') }}</p>
          <div
            v-for="node in executionPlanRows"
            :key="node.sanId"
            class="rounded border border-gray-200 bg-gray-50 p-3 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-gray-800">{{ node.label }} <span class="font-mono text-xs text-gray-500">({{ node.sanId }})</span></p>
                <p class="text-xs text-gray-500">{{ node.devices.join(', ') || mdEmptyMembersMessage }}</p>
              </div>
              <UBadge :label="node.role ?? node.source" color="gray" variant="soft" size="xs" />
            </div>
            <pre v-if="node.command" class="text-xs bg-white border border-gray-200 rounded p-3 max-h-48 overflow-auto font-mono text-gray-700">{{ node.command }}</pre>
            <p v-else class="text-xs text-red-600">{{ mdEmptyMembersMessage }}</p>
          </div>
        </div>
        <UAlert
          v-if="executionPlanError"
          :title="t('raid.create_md.execution_plan.invalid_title')"
          :description="executionPlanError"
          color="red"
          icon="i-heroicons-x-circle"
        />
        <UAlert
          v-if="reusedPartitionMappings.length"
          :title="t('raid.create_md.mapping.reused_title')"
          :description="t('raid.create_md.mapping.reused_description', { count: reusedPartitionMappings.length })"
          color="green"
          icon="i-heroicons-link"
        />
        <UAlert
          v-if="isClustered"
          :title="t('raid.create_md.cluster_execution.title')"
          :description="t('raid.create_md.cluster_execution.description')"
          color="red"
          icon="i-heroicons-bolt"
        />
        <div v-if="executionNodeResults.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.create_md.cluster_execution.status_title') }}</p>
          <p v-if="executionStartedAt" class="text-xs text-gray-500">
            Tentative #{{ executionAttemptId }} démarrée à {{ formatAttemptStarted(executionStartedAt) }}
          </p>
          <div
            v-for="node in executionNodeResults"
            :key="node.sanId"
            class="rounded border border-gray-200 bg-gray-50 p-3 space-y-2"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-800">{{ node.label }} <span class="font-mono text-xs text-gray-500">({{ node.sanId }})</span></p>
                <p class="text-xs text-gray-500">{{ node.devices.join(', ') || mdEmptyMembersMessage }}</p>
              </div>
              <UBadge :color="nodeStatusColor(node.status)" :label="nodeStatusLabel(node.status)" variant="soft" size="xs" />
            </div>
            <pre v-if="executionCommandForNode(node)" class="text-xs bg-white border border-gray-200 rounded p-3 max-h-40 overflow-auto font-mono text-gray-700">{{ executionCommandForNode(node) }}</pre>
            <UAlert
              v-if="nodeShowsMdadmInteractivePrompt(node)"
              :title="mdadmInteractiveConfirmMessage"
              color="amber"
              icon="i-heroicons-exclamation-triangle"
              class="text-xs"
            />
            <pre v-if="node.stdout" class="text-xs bg-gray-900 text-gray-100 rounded p-3 max-h-32 overflow-auto whitespace-pre-wrap">{{ node.stdout }}</pre>
            <pre v-if="node.stderr" class="text-xs bg-gray-900 text-red-200 rounded p-3 max-h-24 overflow-auto whitespace-pre-wrap">{{ node.stderr }}</pre>
            <p v-if="node.error" class="text-xs text-red-600">{{ node.error }}</p>
          </div>
        </div>

        <div v-if="preflightResult?.requiredConfirmation" class="space-y-2">
          <p class="text-sm text-gray-600">
            Saisissez exactement
            <code class="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-mono text-xs">
              {{ preflightResult.requiredConfirmation }}
            </code>
            pour confirmer :
          </p>
          <UInput v-model="form.confirmation" class="font-mono" @paste.prevent />
        </div>

        <label class="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" v-model="understood" class="mt-0.5 accent-red-500" />
          <span class="text-sm text-gray-600">Je comprends que cette opération modifie la configuration de stockage.</span>
        </label>

        <p v-if="submitError && !executionNodeResults.length" class="text-sm text-red-600">{{ submitError }}</p>
      </div>

      <!-- Étape 4 : Terminé -->
      <div v-else-if="step === 4" class="space-y-4">
        <UAlert
          :title="t('raid.create_md.done_title')"
          :description="t('raid.create_md.done_description', { path: createdArrayPath })"
          color="green"
          icon="i-heroicons-check-circle"
        />
        <UAlert
          v-if="createdArrayIsResyncing"
          :title="t('raid.create_md.resync_notice')"
          color="amber"
          icon="i-heroicons-arrow-path"
          variant="soft"
        />
        <p v-if="createPersistedSummary" class="text-xs text-gray-600">{{ createPersistedSummary }}</p>
        <div v-if="executionNodeResults.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.create_md.cluster_execution.status_title') }}</p>
          <div
            v-for="node in executionNodeResults"
            :key="node.sanId"
            class="rounded border border-gray-200 bg-gray-50 p-3 space-y-1"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-gray-800">{{ node.label }}</p>
                <p class="text-xs text-gray-500 font-mono">{{ node.devices.join(', ') }}</p>
              </div>
              <UBadge :color="nodeStatusColor(node.status)" :label="nodeStatusLabel(node.status)" variant="soft" size="xs" />
            </div>
            <p v-if="node.persisted" class="text-xs text-green-700">{{ t('raid.create_md.persisted_notice') }}</p>
          </div>
        </div>
        <div class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.create_md.next_steps_title') }}</p>
          <ol class="list-decimal pl-5 text-sm text-gray-600 space-y-1">
            <li>{{ t('raid.create_md.next_step_use', { path: createdArrayPath }) }}</li>
            <li>{{ t('raid.create_md.next_step_lvm') }}</li>
            <li>{{ t('raid.create_md.next_step_scst') }}</li>
          </ol>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="px-5 py-4 border-t border-gray-100 bg-white shrink-0 flex justify-between">
      <UButton
        color="gray"
        variant="ghost"
        :disabled="busy"
        @click="handleBackOrCancel"
      >
        {{ step === 0 ? 'Annuler' : step === 4 ? t('raid.create_md.close') : 'Retour' }}
      </UButton>
      <UButton
        v-if="step === 4"
        color="blue"
        icon="i-heroicons-server-stack"
        @click="finishViewArray"
      >
        {{ t('raid.create_md.view_array') }}
      </UButton>
      <UButton
        v-else-if="step < 3"
        color="blue"
        :disabled="!canNext || busy"
        @click="handleNext"
      >
        Suivant
      </UButton>
      <UButton
        v-else-if="step === 3"
        color="green"
        :disabled="!canSubmit || busy"
        :loading="busy"
        icon="i-heroicons-bolt"
        @click="submit"
      >
        {{ t('raid.create_md.submit') }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClusterDiskMapping, ClusterDiskMappingInput, ClusterStoragePreflightResult, CreateMdArrayExecutionPlan, CreateMdArrayNodeResult, CreateMdArrayResponse, CreateMdArrayWizardConfirmPayload, RaidBlockDevice, RaidPreflightResult } from '~/types/raid'
import { filterPartitionMappingsForDevices } from '~/utils/raid-cluster-mapping'
import { groupPeerSuperblockBlockers } from '~/utils/create-md-peer-cleanup'
import type { RaidDetectionNavigateFn } from '~/composables/useRaidDetectionNavigate'

const props = defineProps<{
  blockDevices: RaidBlockDevice[]
  sourceSanId?: string
  clusterId?: string | null
  onNavigateDetection?: RaidDetectionNavigateFn
}>()

const emit = defineEmits<{
  confirm: [payload: CreateMdArrayWizardConfirmPayload]
  cancel: []
}>()
const raid = useRaidStore()
const { t } = useEsosI18n()

const steps = ['Partitions', 'Nom & RAID', 'Pré-vérification', 'Confirmation', 'Terminé']
const step = ref(0)
const busy = ref(false)
const understood = ref(false)
const submitError = ref<string | null>(null)
const preflightResult = ref<RaidPreflightResult | null>(null)
const clusterPreflightResult = ref<ClusterStoragePreflightResult | null>(null)
const preflightLoading = ref(false)
const clusterPreflightLoading = ref(false)
const clusterPreflightError = ref<string | null>(null)
const executionPlan = ref<CreateMdArrayExecutionPlan | null>(null)
const executionPlanError = ref<string | null>(null)
const executionNodeResults = ref<CreateMdArrayNodeResult[]>([])
const createResult = ref<CreateMdArrayResponse | null>(null)
const overviewRefreshedOnDone = ref(false)
const executionAttemptId = ref(0)
const executionAttemptToken = ref(0)
const executionStartedAt = ref<Date | null>(null)
const activeExecutionPlanSignature = ref<string | null>(null)
const reusedPartitionMappings = ref<ClusterDiskMappingInput[]>([])
const lastClusterDiskMappings = ref<ClusterDiskMappingInput[]>([])
const manualPartitionMappingSelection = reactive<Record<string, string>>({})

const form = reactive({
  name: 'md0',
  level: '1' as '0' | '1' | '5' | '6' | '10',
  devices: [] as string[],
  chunkKb: 64,
  confirmation: '',
})

const levelOptions = computed(() => [
  { label: t('raid.create_md.form.level_0'), value: '0' as const },
  { label: t('raid.create_md.form.level_1'), value: '1' as const },
  { label: t('raid.create_md.form.level_5'), value: '5' as const },
  { label: t('raid.create_md.form.level_6'), value: '6' as const },
  { label: t('raid.create_md.form.level_10'), value: '10' as const },
])

const chunkOptions = computed(() =>
  [16, 32, 64, 128, 256, 512, 1024].map(v => ({
    label: v === 64 ? t('raid.create_md.form.chunk_64_recommended') : `${v} KiB`,
    value: v,
  })),
)

const minDevices = computed(() => {
  const map: Record<string, number> = { '0': 2, '1': 2, '5': 3, '6': 4, '10': 4 }
  return map[form.level] ?? 2
})

const eligibleDevices = computed(() => props.blockDevices.filter(d => d.eligibleForMd))
const isClustered = computed(() => Boolean(props.clusterId && props.sourceSanId))
const preparedMappingHint = computed(() =>
  props.sourceSanId ? raid.getPreparedClusterMappings(props.sourceSanId, props.clusterId) : null,
)
const suggestedPartitionMappings = computed(() =>
  filterPartitionMappingsForDevices(preparedMappingHint.value, form.devices),
)
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
      targetPath: manualPartitionMappingSelection[mappingKey(mapping)] ?? '',
    }))
    .filter(mapping => mapping.targetPath),
)
const manualMappingComplete = computed(() =>
  ambiguousMappings.value.length > 0
  && ambiguousMappings.value.every(mapping => Boolean(manualPartitionMappingSelection[mappingKey(mapping)])),
)
const duplicateMappingKeys = computed(() => {
  const byPeerTarget = new Map<string, string[]>()
  for (const mapping of ambiguousMappings.value) {
    const targetPath = manualPartitionMappingSelection[mappingKey(mapping)]
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
const mdEmptyMembersMessage = 'Commande MD invalide : aucune partition membre transmise.'
const mdadmInteractiveConfirmPrompt = 'Continue creating array?'
const mdadmInteractiveConfirmMessage = 'mdadm is waiting for interactive confirmation; non-interactive mode is required.'
const executionPlanRows = computed(() => executionPlan.value?.nodeResults ?? [])
const peerSuperblockCleanupGroups = computed(() =>
  clusterPreflightResult.value && props.sourceSanId
    ? groupPeerSuperblockBlockers(clusterPreflightResult.value, props.sourceSanId, form.devices)
    : [],
)
const executionPlanValid = computed(() =>
  executionPlanRows.value.length > 0
  && executionPlanRows.value.every(node =>
    node.devices.length > 0
    && Boolean(node.command)
    && !node.error
    && !/--raid-devices=(?:\s|$)/.test(node.command ?? ''),
  ),
)
const clusterPreflightState = computed<'not_clustered' | 'pending' | 'ok' | 'failed' | 'unavailable'>(() => {
  if (!isClustered.value) return 'not_clustered'
  if (clusterPreflightLoading.value) return 'pending'
  if (clusterPreflightError.value) return 'failed'
  if (clusterPreflightResult.value?.ok) return 'ok'
  if (preflightResult.value?.ok) return 'unavailable'
  return 'pending'
})

const nameError = computed(() =>
  form.name && !/^md\d+$/.test(form.name)
    ? t('raid.create_md.form.array_name_invalid')
    : undefined,
)

const raid10EvenError = computed(() =>
  form.level === '10' && form.devices.length > 0 && form.devices.length % 2 !== 0,
)

const canNext = computed(() => {
  if (step.value === 0) return form.devices.length > 0
  if (step.value === 1) return /^md\d+$/.test(form.name) && form.devices.length >= minDevices.value && !raid10EvenError.value
  if (step.value === 2) return !!preflightResult.value?.ok && (!isClustered.value || clusterPreflightState.value === 'ok') && executionPlanValid.value
  return true
})

const canSubmit = computed(() =>
  understood.value
  && preflightResult.value?.ok
  && (!isClustered.value || clusterPreflightState.value === 'ok')
  && executionPlanValid.value
  && ambiguousMappings.value.length === 0
  && duplicateMappingKeys.value.size === 0
  && (!preflightResult.value?.requiredConfirmation || form.confirmation === preflightResult.value.requiredConfirmation),
)

const createdArrayPath = computed(() => `/dev/${form.name}`)

const createdArrayInOverview = computed(() =>
  raid.mdArrays.find(arr => arr.path === createdArrayPath.value || arr.name === form.name),
)

const createdArrayIsResyncing = computed(() => {
  const state = createdArrayInOverview.value?.state
  return state === 'resync' || state === 'recovering'
})

const createPersistedSummary = computed(() => {
  if (!createResult.value) return ''
  const nodes = executionNodeResults.value
  if (nodes.length === 0) {
    return createResult.value.persisted ? t('raid.create_md.persisted_notice') : ''
  }
  const persistedCount = nodes.filter(node => node.persisted).length
  if (persistedCount === nodes.length) return t('raid.create_md.persisted_notice')
  if (persistedCount > 0) return t('raid.create_md.persisted_partial')
  return ''
})

watch(
  () => [form.name, form.level, form.chunkKb, form.devices.join('\u0000')],
  () => {
    preflightResult.value = null
    clusterPreflightResult.value = null
    clusterPreflightError.value = null
    reusedPartitionMappings.value = []
    lastClusterDiskMappings.value = []
    clearManualPartitionMappings()
    resetPlanAndExecutionState()
  },
)

onMounted(() => {
  resetPlanAndExecutionState()
})

watch(step, async (value) => {
  if (value !== 4) return
  await raid.fetchOverview(true)
  overviewRefreshedOnDone.value = true
})

function buildConfirmPayload(action: CreateMdArrayWizardConfirmPayload['action']): CreateMdArrayWizardConfirmPayload {
  return {
    action,
    arrayPath: createdArrayPath.value,
    overviewRefreshed: overviewRefreshedOnDone.value,
  }
}

function finishClose() {
  emit('confirm', buildConfirmPayload('close'))
}

function finishViewArray() {
  emit('confirm', buildConfirmPayload('view-array'))
}

function handleBackOrCancel() {
  if (step.value === 0) {
    emit('cancel')
    return
  }
  if (step.value === 4) {
    finishClose()
    return
  }
  step.value--
}

async function handleNext() {
  step.value++
  if (step.value === 2) await runPreflight()
}

async function runPreflight() {
  preflightLoading.value = true
  clusterPreflightLoading.value = false
  clusterPreflightResult.value = null
  clusterPreflightError.value = null
  resetPlanAndExecutionState()
  reusedPartitionMappings.value = []
  lastClusterDiskMappings.value = []
  clearManualPartitionMappings()
  const payload = { name: form.name, level: form.level, chunkKb: form.chunkKb, devices: form.devices }
  try {
    preflightResult.value = await raid.preflight({
      backend: 'software_md',
      action: 'create_md',
      payload,
    })
    if (preflightResult.value.requiredConfirmation) {
      form.confirmation = ''
    }
    if (isClustered.value) {
      await runClusterPreflight(payload, suggestedPartitionMappings.value)
    } else if (preflightResult.value.ok) {
      await requestExecutionPlan(payload, [])
    }
  } catch (err: any) {
    if (preflightResult.value) clusterPreflightError.value = err?.data?.statusMessage ?? err.message ?? 'Préflight stockage cluster indisponible'
    else preflightResult.value = null
  } finally {
    preflightLoading.value = false
    clusterPreflightLoading.value = false
  }
}

async function rerunClusterPreflightWithMappings() {
  const payload = { name: form.name, level: form.level, chunkKb: form.chunkKb, devices: form.devices }
  resetExecutionState()
  await runClusterPreflight(payload, [...suggestedPartitionMappings.value, ...manualMappingInputs.value])
}

async function onPeerSuperblockCleanupDone() {
  const payload = { name: form.name, level: form.level, chunkKb: form.chunkKb, devices: form.devices }
  const diskMappings = lastClusterDiskMappings.value.length
    ? lastClusterDiskMappings.value
    : [...suggestedPartitionMappings.value, ...manualMappingInputs.value]
  await runClusterPreflight(payload, diskMappings)
}

async function runClusterPreflight(payload: Record<string, unknown>, diskMappings: ClusterDiskMappingInput[]) {
  clusterPreflightLoading.value = true
  clusterPreflightError.value = null
  resetPlanAndExecutionState()
  try {
    reusedPartitionMappings.value = diskMappings.filter(mapping =>
      suggestedPartitionMappings.value.some(suggested =>
        suggested.sourcePath === mapping.sourcePath
        && suggested.targetSanId === mapping.targetSanId
        && suggested.targetPath === mapping.targetPath,
      ),
    )
    clusterPreflightResult.value = await raid.clusterStoragePreflight({
      clusterId: props.clusterId ?? undefined,
      primarySanId: props.sourceSanId!,
      action: 'create_md',
      payload,
      diskMappings,
    })
    lastClusterDiskMappings.value = [...diskMappings]
    if (clusterPreflightResult.value.ok) {
      await requestExecutionPlan(payload, diskMappings)
    }
  } catch (err: any) {
    clusterPreflightError.value = err?.data?.statusMessage ?? err.message ?? 'Préflight stockage cluster indisponible'
    executionPlan.value = null
  } finally {
    clusterPreflightLoading.value = false
  }
}

async function requestExecutionPlan(payload: Record<string, unknown>, diskMappings: ClusterDiskMappingInput[]) {
  resetPlanAndExecutionState()
  try {
    executionPlan.value = await raid.planCreateMdArray({
      name: String(payload.name),
      level: payload.level as '0' | '1' | '5' | '6' | '10',
      devices: Array.isArray(payload.devices) ? payload.devices.map(device => String(device)) : [],
      chunkKb: Number(payload.chunkKb),
      confirmation: form.confirmation,
      clusterExecution: isClustered.value
        ? {
            clusterId: props.clusterId ?? undefined,
            primarySanId: props.sourceSanId!,
            diskMappings,
            requirePreflightOk: true,
            stopOnFirstFailure: true,
          }
        : undefined,
    })
    activeExecutionPlanSignature.value = executionPlanSignature(executionPlan.value)
    resetExecutionState()
  } catch (err: any) {
    executionPlanError.value = err?.data?.statusMessage ?? err.message ?? mdEmptyMembersMessage
  }
}

async function submit() {
  if (busy.value || !executionPlanValid.value) return
  busy.value = true
  resetExecutionState()
  executionAttemptId.value += 1
  executionAttemptToken.value += 1
  const attemptId = executionAttemptId.value
  const attemptToken = executionAttemptToken.value
  executionStartedAt.value = new Date()
  activeExecutionPlanSignature.value = executionPlanSignature(executionPlan.value)
  const attemptPlanSignature = activeExecutionPlanSignature.value
  const selectedDevices = [...form.devices]
  executionNodeResults.value = buildPendingExecutionNodeResults()
  if (executionNodeResults.value[0]) executionNodeResults.value[0].status = 'running'
  try {
    const result = await raid.createMdArray({
      name: form.name,
      level: form.level,
      devices: selectedDevices,
      chunkKb: form.chunkKb,
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
    if (attemptId !== executionAttemptId.value || attemptToken !== executionAttemptToken.value || attemptPlanSignature !== executionPlanSignature(executionPlan.value)) return
    createResult.value = result
    if (result.clusterExecution?.nodeResults) {
      executionNodeResults.value = result.clusterExecution.nodeResults
    } else {
      executionNodeResults.value = executionNodeResults.value.map(node => ({
        ...node,
        status: 'success',
        command: result.command,
        stdout: result.stdout,
        persisted: result.persisted,
      }))
    }
    step.value = 4
  } catch (err: any) {
    if (attemptId !== executionAttemptId.value || attemptToken !== executionAttemptToken.value || attemptPlanSignature !== executionPlanSignature(executionPlan.value)) return
    const errorData = err?.data?.data ?? err?.data ?? {}
    const nodeErrorMessage = typeof errorData.statusMessage === 'string'
      ? errorData.statusMessage
      : (err?.data?.statusMessage ?? err.message ?? 'Erreur lors de la création')
    submitError.value = nodeErrorMessage
    const failedExecution = err?.data?.data?.clusterExecution ?? err?.data?.clusterExecution
    if (failedExecution?.nodeResults && nodeResultsSignature(failedExecution.nodeResults) === attemptPlanSignature) {
      executionNodeResults.value = failedExecution.nodeResults
    } else if (executionNodeResults.value.length) {
      const runningIndex = executionNodeResults.value.findIndex(node => node.status === 'running')
      const failedIndex = runningIndex >= 0 ? runningIndex : 0
      executionNodeResults.value = executionNodeResults.value.map((node, index) => index === failedIndex
        ? {
            ...node,
            status: 'failed',
            command: typeof errorData.command === 'string' ? errorData.command : executionCommandForNode(node),
            stdout: typeof errorData.stdout === 'string' ? errorData.stdout : node.stdout,
            stderr: typeof errorData.stderr === 'string' ? errorData.stderr : node.stderr,
            error: nodeErrorMessage,
          }
        : node)
    }
  } finally {
    busy.value = false
  }
}

function resetExecutionState(): void {
  submitError.value = null
  executionNodeResults.value = []
  executionStartedAt.value = null
  executionAttemptToken.value += 1
  createResult.value = null
  overviewRefreshedOnDone.value = false
}

function resetPlanAndExecutionState(): void {
  executionPlan.value = null
  executionPlanError.value = null
  activeExecutionPlanSignature.value = null
  resetExecutionState()
}

function executionPlanSignature(plan: CreateMdArrayExecutionPlan | null): string {
  return nodeResultsSignature(plan?.nodeResults ?? [])
}

function nodeResultsSignature(nodes: CreateMdArrayNodeResult[]): string {
  return JSON.stringify(nodes.map(node => ({
    sanId: node.sanId,
    devices: node.devices,
    command: node.command ?? '',
  })))
}

function executionCommandForNode(node: CreateMdArrayNodeResult): string | undefined {
  if (node.command) return node.command
  return executionPlanRows.value.find(planNode => planNode.sanId === node.sanId)?.command
}

function nodeShowsMdadmInteractivePrompt(node: CreateMdArrayNodeResult): boolean {
  const combined = [node.stdout, node.stderr].filter(Boolean).join('\n')
  return combined.includes(mdadmInteractiveConfirmPrompt)
}

function buildPendingExecutionNodeResults(): CreateMdArrayNodeResult[] {
  return executionPlanRows.value.map(node => ({
    ...node,
    devices: [...node.devices],
    status: 'pending',
    stdout: undefined,
    stderr: undefined,
    error: undefined,
  }))
}

function nodeStatusColor(status: CreateMdArrayNodeResult['status']): 'gray' | 'blue' | 'green' | 'red' {
  if (status === 'running') return 'blue'
  if (status === 'success') return 'green'
  if (status === 'failed') return 'red'
  return 'gray'
}

function nodeStatusLabel(status: CreateMdArrayNodeResult['status']): string {
  return t(`raid.create_md.cluster_execution.status.${status}`)
}

function formatAttemptStarted(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}

function mappingKey(mapping: Pick<ClusterDiskMapping, 'sourcePath' | 'targetSanId'>): string {
  return `${mapping.targetSanId}::${mapping.sourcePath}`
}

function clearManualPartitionMappings() {
  for (const key of Object.keys(manualPartitionMappingSelection)) delete manualPartitionMappingSelection[key]
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
