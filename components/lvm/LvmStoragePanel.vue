<template>
  <div class="space-y-4">
    <StorageReadOnlyBanner :read-only="readOnly" />

    <UAlert
      v-for="(alert, i) in lvm.alerts"
      :key="i"
      :title="tLvmAlert(alert)"
      :color="alert.severity === 'critical' ? 'red' : 'amber'"
      variant="soft"
    />

    <div
      v-if="isClustered"
      class="rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/80 dark:bg-primary-950/30 px-3 py-2"
    >
      <p class="text-xs text-primary-800 dark:text-primary-200 flex items-center gap-2">
        <UIcon name="i-heroicons-information-circle" class="w-4 h-4 shrink-0" />
        <span>{{ t('lvm.provisioning.cluster.mode_compact') }}</span>
      </p>
      <details class="mt-1 text-xs text-primary-700 dark:text-primary-300">
        <summary class="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          {{ t('lvm.provisioning.cluster.learn_more') }}
        </summary>
        <p class="mt-1 pl-6">{{ t('lvm.cluster.mode_body') }}</p>
      </details>
    </div>

    <div class="flex flex-wrap gap-2 justify-between items-center">
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="primary"
            icon="i-heroicons-plus"
            :disabled="!actionAvail.pvCreate.enabled"
            :title="disabledReason(actionAvail.pvCreate)"
            @click="openPvWizard"
          >
            {{ t('lvm.pv.create_action') }}
          </UButton>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="i-heroicons-plus"
            :disabled="!actionAvail.vgCreate.enabled"
            :title="disabledReason(actionAvail.vgCreate)"
            @click="openVgWizard"
          >
            {{ t('lvm.vg.create_action') }}
          </UButton>
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="i-heroicons-plus"
            :disabled="!actionAvail.lvCreate.enabled"
            :title="disabledReason(actionAvail.lvCreate)"
            @click="openLvWizard"
          >
            {{ t('lvm.lv.create_action') }}
          </UButton>
        </div>
        <p v-if="actionHint" class="text-[11px] text-gray-500 dark:text-gray-400 max-w-2xl">
          {{ actionHint }}
        </p>
      </div>
      <UButton size="sm" color="gray" variant="ghost" icon="i-heroicons-arrow-path" :loading="refreshing" @click="refreshAll">
        {{ t('lvm.overview.refresh') }}
      </UButton>
    </div>

    <div v-if="isClustered && lvm.clusterInventoryLoading && !clusterView" class="text-sm text-gray-500 dark:text-gray-400">
      {{ t('lvm.cluster.view.inventory_loading') }}
    </div>

    <template v-if="isClustered && clusterView">
      <LvmClusterLvmSummary :view="clusterView" />

      <LvmProvisioningChain :steps="clusterView.chainSteps" />

      <LvmNextStepCard
        :action="clusterView.nextAction"
        :can-mutate="canMutate"
        :cta-disabled="!nextStepCtaEnabled"
        :cta-disabled-reason="nextStepCtaReason"
        @action="onNextStepAction"
      />

      <div v-if="clusterView.issues.length" class="space-y-1">
        <UAlert
          v-for="(issue, i) in clusterView.issues"
          :key="i"
          :title="symmetryIssueTitle(issue)"
          :description="issue.message"
          :color="issue.severity === 'critical' ? 'red' : 'amber'"
          variant="soft"
          size="sm"
        />
      </div>

      <UCard>
        <template #header>
          <h3 class="text-sm font-medium">{{ t('lvm.cluster.view.table.pv_title') }}</h3>
        </template>
        <LvmClusterComparisonTable
          :columns="pvColumns"
          :rows="pvRowsDisplay"
          :empty-text="t('lvm.provisioning.empty.pv')"
        >
          <template #actions="{ row }">
            <UButton
              v-if="row.isPrimary && row.status === 'ok' && canMutate"
              size="xs"
              color="red"
              variant="ghost"
              @click="openRemovePvWizard(String(row.path))"
            >
              {{ t('lvm.pv.remove') }}
            </UButton>
          </template>
        </LvmClusterComparisonTable>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-sm font-medium">{{ t('lvm.cluster.view.table.vg_title') }}</h3>
        </template>
        <LvmClusterComparisonTable
          :columns="vgColumns"
          :rows="vgRowsDisplay"
          :empty-text="t('lvm.provisioning.empty.vg')"
        >
          <template #actions="{ row }">
            <UButton
              v-if="row.isPrimary && row.status === 'ok' && canMutate"
              size="xs"
              color="red"
              variant="ghost"
              @click="openRemoveVgWizard(String(row.name))"
            >
              {{ t('lvm.vg.remove') }}
            </UButton>
          </template>
        </LvmClusterComparisonTable>
      </UCard>

      <UCard>
        <template #header>
          <h3 class="text-sm font-medium">{{ t('lvm.cluster.view.table.lv_title') }}</h3>
        </template>
        <LvmClusterComparisonTable
          :columns="lvColumns"
          :rows="lvRowsDisplay"
          :empty-text="t('lvm.provisioning.empty.lv')"
        >
          <template #actions="{ row }">
            <template v-if="row.isPrimary && canMutate">
              <UButton
                v-if="row.status === 'scst_missing'"
                size="xs"
                variant="soft"
                @click="openScstWizard(primaryLvByPath(String(row.path)))"
              >
                {{ t('lvm.lv.bind_scst') }}
              </UButton>
              <UButton
                v-else-if="row.status === 'scst_partial'"
                size="xs"
                color="amber"
                variant="soft"
                @click="openScstWizard(primaryLvByPath(String(row.path)))"
              >
                {{ t('lvm.lv.repair_scst') }}
              </UButton>
              <UButton
                v-if="row.status === 'scst_missing' || row.status === 'scst_partial' || row.status === 'ok'"
                size="xs"
                color="red"
                variant="ghost"
                class="ml-1"
                @click="openRemoveLvWizard(primaryLvByPath(String(row.path)))"
              >
                {{ t('lvm.lv.remove') }}
              </UButton>
            </template>
          </template>
        </LvmClusterComparisonTable>
      </UCard>
    </template>

    <template v-else-if="!isClustered">
    <LvmProvisioningChain :steps="provisioningChain" />

    <UAlert
      v-if="blockProvisioningComplete"
      color="blue"
      variant="soft"
      :title="t('storage.workflow.lvm.blockio_banner_title')"
      :description="t('storage.workflow.lvm.blockio_banner_body')"
    />

    <LvmNextStepCard
      :action="activeNextAction"
      :can-mutate="canMutate"
      :cta-disabled="!nextStepCtaEnabled"
      :cta-disabled-reason="nextStepCtaReason"
      @action="onNextStepAction"
    />

    <div v-if="isClustered && symmetryIssues.length" class="space-y-1">
      <UAlert
        v-for="(issue, i) in symmetryIssues"
        :key="i"
        :title="symmetryIssueTitle(issue)"
        :description="issue.message"
        :color="issue.severity === 'critical' ? 'red' : 'amber'"
        variant="soft"
        size="sm"
      />
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-medium">
            {{ isClustered ? t('lvm.cluster.this_node') : '' }}
            {{ isClustered ? ' — ' : '' }}{{ t('lvm.pv.table_title') }}
          </h3>
          <UBadge v-if="lvm.pvs.length" color="gray" variant="soft" size="xs" :label="String(lvm.pvs.length)" />
        </div>
      </template>
      <div v-if="lvm.pvs.length" class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500 dark:text-gray-400 border-b">
              <th class="py-1.5 pr-3">PV</th>
              <th class="py-1.5 pr-3">VG</th>
              <th class="py-1.5 pr-3">{{ t('lvm.col.size') }}</th>
              <th class="py-1.5" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in lvm.pvs" :key="row.path" class="border-b border-gray-100 dark:border-gray-800">
              <td class="py-1.5 font-mono">{{ row.path }}</td>
              <td class="py-1.5">{{ row.vgName || '—' }}</td>
              <td class="py-1.5">{{ formatBytes(row.sizeBytes) }}</td>
              <td class="py-1.5 text-right">
                <UButton v-if="!row.vgName && canMutate" size="xs" color="red" variant="ghost" @click="openRemovePvWizard(row.path)">
                  {{ t('lvm.pv.remove') }}
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">{{ t('lvm.provisioning.empty.pv') }}</p>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-medium">{{ t('lvm.vg.table_title') }}</h3>
          <UBadge v-if="lvm.vgs.length" color="gray" variant="soft" size="xs" :label="String(lvm.vgs.length)" />
        </div>
      </template>
      <div v-if="lvm.vgs.length" class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500 dark:text-gray-400 border-b">
              <th class="py-1.5 pr-3">VG</th>
              <th class="py-1.5 pr-3">{{ t('lvm.col.size_free') }}</th>
              <th class="py-1.5 pr-3">PVs</th>
              <th class="py-1.5 pr-3">LVs</th>
              <th class="py-1.5" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in lvm.vgs" :key="row.name" class="border-b border-gray-100 dark:border-gray-800">
              <td class="py-1.5 font-mono">{{ row.name }}</td>
              <td class="py-1.5">{{ formatBytes(row.sizeBytes) }} / {{ formatBytes(row.freeBytes) }}</td>
              <td class="py-1.5">{{ row.pvCount }}</td>
              <td class="py-1.5">{{ row.lvCount }}</td>
              <td class="py-1.5 text-right">
                <UBadge v-if="row.clustered" color="amber" size="xs" :label="t('lvm.vg.clustered')" />
                <UButton v-if="canMutate && !row.clustered" size="xs" color="red" variant="ghost" class="ml-2" @click="openRemoveVgWizard(row.name)">
                  {{ t('lvm.vg.remove') }}
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">{{ t('lvm.provisioning.empty.vg') }}</p>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-medium">{{ t('lvm.lv.table_title') }}</h3>
          <UBadge v-if="displayLvs.length" color="gray" variant="soft" size="xs" :label="String(displayLvs.length)" />
        </div>
      </template>
      <div v-if="displayLvs.length" class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500 dark:text-gray-400 border-b">
              <th class="py-1.5 pr-3">LV</th>
              <th class="py-1.5 pr-3">{{ t('lvm.lv.col_backing_path') }}</th>
              <th class="py-1.5 pr-3">VG</th>
              <th class="py-1.5 pr-3">{{ t('lvm.col.size') }}</th>
              <th class="py-1.5 pr-3">{{ t('storage.workflow.lv_usage.column') }}</th>
              <th class="py-1.5 pr-3">SCST</th>
              <th class="py-1.5" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in displayLvs" :key="`${row.vgName}/${row.name}`" class="border-b border-gray-100 dark:border-gray-800">
              <td class="py-1.5 font-mono">{{ row.displayName || `${row.vgName}/${row.name}` }}</td>
              <td class="py-1.5 font-mono text-gray-600 dark:text-gray-400 break-all">{{ row.path }}</td>
              <td class="py-1.5">{{ row.vgName }}</td>
              <td class="py-1.5">{{ formatBytes(row.sizeBytes) }}</td>
              <td class="py-1.5">
                <UBadge
                  :color="lvUsageView(row).badgeColor"
                  size="xs"
                  variant="soft"
                  :label="t(lvUsageView(row).labelKey)"
                />
              </td>
              <td class="py-1.5">
                <template v-if="lvScstUiState(row) === 'linked'">
                  <span class="font-mono text-gray-700 dark:text-gray-300">{{ lvScstLabel(row) }}</span>
                </template>
                <template v-else-if="lvScstUiState(row) === 'partial'">
                  <UBadge color="amber" variant="soft" size="xs" :label="t('lvm.lv.scst_partial')" class="mr-1" />
                  <span class="font-mono text-gray-600 dark:text-gray-400">{{ lvScstLabel(row) || '—' }}</span>
                  <UButton
                    v-if="canMutate"
                    size="xs"
                    color="amber"
                    variant="soft"
                    class="ml-1"
                    @click="openScstWizard(row)"
                  >
                    {{ t('lvm.lv.repair_scst') }}
                  </UButton>
                </template>
                <UButton
                  v-else-if="canMutate && lvCanBindScst(row)"
                  size="xs"
                  variant="soft"
                  @click="openScstWizard(row)"
                >
                  {{ t('lvm.lv.bind_scst') }}
                </UButton>
              </td>
              <td class="py-1.5 text-right">
                <UButton v-if="canMutate && lvCanBindScst(row)" size="xs" color="red" variant="ghost" @click="openRemoveLvWizard(row)">
                  {{ t('lvm.lv.remove') }}
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">{{ t('lvm.provisioning.empty.lv') }}</p>
    </UCard>
    </template>

    <details
      v-if="showTechnicalDetails"
      class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40"
    >
      <summary class="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 select-none list-none [&::-webkit-details-marker]:hidden">
        {{ t('lvm.provisioning.technical.title') }}
      </summary>
      <div class="px-4 pb-4 pt-1 space-y-4 border-t border-gray-200 dark:border-gray-700">
        <div v-if="displayCandidates.length">
          <h4 class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{{ t('lvm.provisioning.technical.candidates') }}</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left text-gray-500 dark:text-gray-400 border-b">
                  <th class="py-1 pr-3">{{ t('lvm.col.device') }}</th>
                  <th class="py-1 pr-3">{{ t('lvm.col.kind') }}</th>
                  <th class="py-1">{{ t('lvm.col.size') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in displayCandidates" :key="row.path" class="border-b border-gray-100 dark:border-gray-800">
                  <td class="py-1 font-mono">{{ row.path }}</td>
                  <td class="py-1">{{ row.kind }}</td>
                  <td class="py-1">{{ formatBytes(row.sizeBytes) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <template v-if="isClustered && lvm.clusterPeers.length">
          <div v-for="peer in lvm.clusterPeers" :key="peer.nodeSanId">
            <h4 class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              {{ t('lvm.provisioning.technical.peers') }} — {{ t('lvm.cluster.peer_node', { label: peer.nodeLabel }) }}
            </h4>
            <div class="grid grid-cols-3 gap-2 text-xs mb-2">
              <div><span class="text-gray-500 dark:text-gray-400">PV</span> {{ peer.pvs.length }}</div>
              <div><span class="text-gray-500 dark:text-gray-400">VG</span> {{ peer.vgs.length }}</div>
              <div><span class="text-gray-500 dark:text-gray-400">LV</span> {{ peer.lvs.length }}</div>
            </div>
            <div v-if="peer.vgs.length" class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-left text-gray-500 dark:text-gray-400 border-b">
                    <th class="py-1 pr-2">VG</th>
                    <th class="py-1">{{ t('lvm.col.size_free') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="vg in peer.vgs" :key="vg.name" class="border-b border-gray-100 dark:border-gray-800">
                    <td class="py-1 font-mono">{{ vg.name }}</td>
                    <td class="py-1">{{ formatBytes(vg.freeBytes) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-xs text-gray-500 dark:text-gray-400">{{ t('lvm.cluster.peer_empty') }}</p>
          </div>
        </template>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import type { LogicalVolume, LocalSymmetricLvmIssue } from '~/types/lvm'
import { listClusterEligiblePaths, symmetryIssuesForOverview } from '~/utils/lvm-cluster-ui'
import { buildClusterLvmViewModel } from '~/utils/lvm-cluster-view-model'
import {
  buildLvmActionAvailability,
  enrichLvWithClusterScst,
  lvCanBindScst,
  lvScstDeviceLabel,
  lvScstUiState,
  type LvmActionAvailability,
} from '~/utils/lvm-action-availability'
import {
  buildProvisioningChain,
  computeLvmNextAction,
  type LvmNextAction,
} from '~/utils/lvm-provisioning-chain'
import { classifyLvFileioUsage, isBlockProvisioningComplete } from '~/utils/lvm-lv-usage'
import { fileioEligibleBackendPaths } from '~/utils/storage-workflow-guidance'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  readOnly?: boolean
}>()

const emit = defineEmits<{ 'navigate-block-devices': [] }>()

const { t, tLvmAlert } = useEsosI18n()
const lvm = useLvmStore()
const fs = useFsStore()
const { pendingPrefill, consumeLvWizardPrefill } = useLvWizardPrefill()
const { open: openModal } = useAppModal()

const canMutate = computed(() => !props.readOnly)
const canCreate = computed(() => canMutate.value)
const clusterId = computed(() => props.clusterId ?? '')

watch(() => props.sanId, (id) => {
  if (id) {
    lvm.setSanId(id)
    fs.setSanId(id)
    if (props.isClustered && props.clusterId) {
      lvm.setClusterContext(props.clusterId, id)
    }
    lvm.fetchOverview()
  }
}, { immediate: true })

const refreshing = computed(() => lvm.loading || lvm.clusterInventoryLoading)

async function refreshAll() {
  await lvm.fetchOverview(true)
}

async function refreshAfterWizard() {
  await refreshAll()
}

function navigateBlockDevicesFromWizard() {
  emit('navigate-block-devices')
}

const eligibleCandidates = computed(() => lvm.candidates.filter(c => c.eligible))

const displayCandidates = computed(() => {
  if (props.isClustered && props.clusterId && lvm.clusterInventory) {
    return listClusterEligiblePaths(props.sanId, lvm.candidates, lvm.clusterInventory)
  }
  return eligibleCandidates.value
})

const symmetryIssues = computed((): LocalSymmetricLvmIssue[] => {
  if (!props.isClustered || !lvm.overview) return []
  return symmetryIssuesForOverview(
    { pvs: lvm.pvs, vgs: lvm.vgs, lvs: lvm.lvs },
    lvm.clusterPeers,
  )
})

const displayLvs = computed(() => {
  const base = lvm.lvs
  if (props.isClustered && lvm.clusterInventory?.length) {
    return base.map(lv => enrichLvWithClusterScst(lv, lvm.clusterInventory!))
  }
  return base
})

const actionContext = computed(() => ({
  candidates: displayCandidates.value,
  pvs: lvm.pvs,
  vgs: lvm.vgs,
  lvs: displayLvs.value,
  orphanPvs: lvm.orphanPvs,
  readOnly: props.readOnly,
  symmetryIssues: symmetryIssues.value,
  isClustered: props.isClustered,
  clusterInventory: lvm.clusterInventory,
  primarySanId: props.sanId,
}))

const provisioningContext = computed(() => actionContext.value)

const actionAvail = computed(() => buildLvmActionAvailability(actionContext.value))

function disabledReason(avail: LvmActionAvailability): string | undefined {
  return avail.reasonKey ? (t(avail.reasonKey) as string) : undefined
}

const actionHint = computed(() => {
  const keys = [
    actionAvail.value.pvCreate,
    actionAvail.value.vgCreate,
    actionAvail.value.lvCreate,
    actionAvail.value.bindScst,
  ]
  const first = keys.find(k => !k.enabled && k.reasonKey)
  return first?.reasonKey ? (t(first.reasonKey) as string) : ''
})

function nextStepAvailability(kind: LvmNextAction): LvmActionAvailability {
  switch (kind.action) {
    case 'pv': return actionAvail.value.pvCreate
    case 'vg': return actionAvail.value.vgCreate
    case 'lv': return actionAvail.value.lvCreate
    case 'scst': return actionAvail.value.bindScst
    default: return { enabled: true }
  }
}

const nextStepCtaEnabled = computed(() => {
  const a = activeNextAction.value
  if (['complete', 'readonly', 'blocked'].includes(a.kind)) return false
  if (!a.action) return false
  return nextStepAvailability(a).enabled
})

const nextStepCtaReason = computed(() => {
  const a = activeNextAction.value
  if (nextStepCtaEnabled.value) return ''
  const avail = nextStepAvailability(a)
  return disabledReason(avail) ?? ''
})

const clusterView = computed(() => {
  if (!props.isClustered) return null
  return buildClusterLvmViewModel({
    primarySanId: props.sanId,
    nodes: lvm.clusterInventory ?? [],
    diskMappings: lvm.lastDiskMappings,
    readOnly: props.readOnly,
    overview: lvm.overview,
    clusterPeers: lvm.clusterPeers,
  })
})

const pvRowsDisplay = computed(() =>
  (clusterView.value?.comparison.pvRows ?? []).map(r => ({
    ...r,
    sizeBytes: formatBytes(r.sizeBytes),
  })),
)

const vgRowsDisplay = computed(() =>
  (clusterView.value?.comparison.vgRows ?? []).map(r => ({
    ...r,
    sizeFree: `${formatBytes(r.sizeBytes)} / ${formatBytes(r.freeBytes)}`,
  })),
)

const lvRowsDisplay = computed(() =>
  (clusterView.value?.comparison.lvRows ?? []).map(r => ({
    ...r,
    sizeBytes: formatBytes(r.sizeBytes),
  })),
)

const activeNextAction = computed(() =>
  clusterView.value?.nextAction ?? nextAction.value,
)

const provisioningChain = computed(() => buildProvisioningChain(provisioningContext.value))
const nextAction = computed(() => computeLvmNextAction(provisioningContext.value))

const fileioEligiblePaths = computed(() => fileioEligibleBackendPaths(fs.backends))

const blockProvisioningComplete = computed(() => isBlockProvisioningComplete(displayLvs.value))

function lvUsageView(lv: LogicalVolume) {
  return classifyLvFileioUsage(lv, { fileioEligiblePaths: fileioEligiblePaths.value })
}

const lvScstLabel = lvScstDeviceLabel

const pvColumns = computed(() => [
  { key: 'nodeLabel', label: t('lvm.cluster.view.col.node') },
  { key: 'path', label: 'PV', mono: true },
  { key: 'vgName', label: 'VG' },
  { key: 'sizeBytes', label: t('lvm.col.size') },
  { key: 'status', label: t('lvm.cluster.view.col.status') },
  { key: 'actions', label: '' },
])

const vgColumns = computed(() => [
  { key: 'nodeLabel', label: t('lvm.cluster.view.col.node') },
  { key: 'name', label: 'VG', mono: true },
  { key: 'sizeFree', label: t('lvm.col.size_free') },
  { key: 'pvCount', label: 'PVs' },
  { key: 'lvCount', label: 'LVs' },
  { key: 'status', label: t('lvm.cluster.view.col.status') },
  { key: 'actions', label: '' },
])

const lvColumns = computed(() => [
  { key: 'nodeLabel', label: t('lvm.cluster.view.col.node') },
  { key: 'path', label: 'LV', mono: true },
  { key: 'vgName', label: 'VG' },
  { key: 'sizeBytes', label: t('lvm.col.size') },
  { key: 'scst', label: 'SCST' },
  { key: 'status', label: t('lvm.cluster.view.col.status') },
  { key: 'actions', label: '' },
])

function primaryLvByPath(path: string): LogicalVolume {
  const lv = displayLvs.value.find(l => l.path === path) ?? lvm.lvs.find(l => l.path === path)
  if (lv) return lv
  return {
    name: path.split('/').pop() ?? 'lv',
    path,
    vgName: path.split('/')[2] ?? '',
    sizeBytes: 0,
    uuid: '',
    active: true,
    usedBy: [],
  }
}

const showTechnicalDetails = computed(() =>
  displayCandidates.value.length > 0
  || (props.isClustered && lvm.clusterPeers.length > 0),
)

function onNextStepAction(kind: NonNullable<LvmNextAction['action']>) {
  switch (kind) {
    case 'pv':
      openPvWizard()
      break
    case 'vg':
      openVgWizard()
      break
    case 'lv':
      void openLvWizard()
      break
    case 'scst': {
      const lv = activeNextAction.value.targetLv
      if (lv) openScstWizard(lv)
      break
    }
    case 'block_devices':
      emit('navigate-block-devices')
      break
  }
}

async function openPvWizard() {
  const Wizard = props.isClustered && clusterId.value
    ? (await import('~/components/lvm/LvmClusterPvWizard.vue')).default
    : (await import('~/components/lvm/LvmCreatePvWizard.vue')).default
  try {
    await openModal({
      component: Wizard,
      props: {
        sanId: props.sanId,
        ...(props.isClustered && clusterId.value ? { clusterId: clusterId.value } : {}),
        persistent: true,
        onNavigateBlockDevices: navigateBlockDevicesFromWizard,
      },
    })
    await refreshAfterWizard()
  } catch { /* dismissed */ }
}

async function openVgWizard() {
  const Wizard = props.isClustered && clusterId.value
    ? (await import('~/components/lvm/LvmClusterVgWizard.vue')).default
    : (await import('~/components/lvm/LvmCreateVgWizard.vue')).default
  try {
    await openModal({
      component: Wizard,
      props: {
        sanId: props.sanId,
        ...(props.isClustered && clusterId.value ? { clusterId: clusterId.value } : {}),
        persistent: true,
      },
    })
    await refreshAfterWizard()
  } catch { /* dismissed */ }
}

async function openLvWizard(prefill?: { lvName?: string; vgName?: string }) {
  const Wizard = props.isClustered && clusterId.value
    ? (await import('~/components/lvm/LvmClusterLvWizard.vue')).default
    : (await import('~/components/lvm/LvmCreateLvWizard.vue')).default
  try {
    await openModal({
      component: Wizard,
      props: {
        sanId: props.sanId,
        ...(props.isClustered && clusterId.value ? { clusterId: clusterId.value } : {}),
        ...(!props.isClustered && prefill?.lvName ? { initialLvName: prefill.lvName } : {}),
        ...(!props.isClustered && prefill?.vgName ? { initialVgName: prefill.vgName } : {}),
        persistent: true,
      },
    })
    await refreshAfterWizard()
  } catch { /* dismissed */ }
}

watch(pendingPrefill, async (prefill) => {
  if (!prefill || props.isClustered || props.readOnly) return
  const payload = consumeLvWizardPrefill()
  if (payload) await openLvWizard(payload)
})

function symmetryIssueTitle(issue: LocalSymmetricLvmIssue) {
  if (issue.lvName) return `LV ${issue.vgName}/${issue.lvName}`
  if (issue.vgName) return `VG ${issue.vgName}`
  return t('lvm.cluster.symmetry_title')
}

function formatBytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${u[i]}`
}

async function openScstWizard(lv: LogicalVolume) {
  const { default: Wizard } = await import('~/components/lvm/LvmBindScstWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: {
        sanId: props.sanId,
        lv,
        isClustered: props.isClustered,
        clusterId: clusterId.value || undefined,
        persistent: true,
      },
    })
    await refreshAfterWizard()
  } catch { /* dismissed */ }
}

async function openRemovePvWizard(path: string) {
  if (!canMutate.value) return
  const { default: Wizard } = await import('~/components/lvm/LvmRemovePvWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: {
        sanId: props.sanId,
        path,
        isClustered: props.isClustered,
        clusterId: clusterId.value || undefined,
        persistent: true,
      },
    })
    await refreshAfterWizard()
  } catch { /* dismissed */ }
}

async function openRemoveVgWizard(name: string) {
  if (!canMutate.value) return
  const { default: Wizard } = await import('~/components/lvm/LvmRemoveVgWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: {
        sanId: props.sanId,
        vgName: name,
        isClustered: props.isClustered,
        clusterId: clusterId.value || undefined,
        persistent: true,
      },
    })
    await refreshAfterWizard()
  } catch { /* dismissed */ }
}

async function openRemoveLvWizard(lv: LogicalVolume) {
  if (!canMutate.value) return
  const { default: Wizard } = await import('~/components/lvm/LvmRemoveLvWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: {
        sanId: props.sanId,
        vgName: lv.vgName,
        lvName: lv.name,
        isClustered: props.isClustered,
        clusterId: clusterId.value || undefined,
        persistent: true,
      },
    })
    await refreshAfterWizard()
  } catch { /* dismissed */ }
}
</script>
