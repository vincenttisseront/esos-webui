<template>
  <div class="p-6 space-y-6">
    <!-- En-tête -->
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <UButton
          to="/admin/sans"
          icon="i-heroicons-arrow-left"
          variant="ghost"
          size="sm"
          color="gray"
        />
        <UIcon name="i-heroicons-circle-stack" class="w-6 h-6 text-purple-500" />
        <div>
          <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100">Gestion RAID</h1>
          <p class="text-sm text-gray-500">{{ san?.label ?? sanId }}</p>
        </div>
        <RaidHealthBadge :health="raid.globalHealth" />
      </div>
      <div class="flex items-center gap-2">
        <span v-if="raid.overview" class="text-xs text-gray-600">
          Scan : {{ new Date(raid.overview.scannedAt).toLocaleTimeString() }}
        </span>
        <UButton
          size="sm"
          color="gray"
          variant="ghost"
          icon="i-heroicons-arrow-path"
          :loading="raid.loading"
          @click="raid.fetchOverview(true)"
        >
          Rafraîchir
        </UButton>
      </div>
    </div>

    <!-- Alertes critiques -->
    <div v-if="raid.criticalAlerts.length" class="space-y-2">
      <UAlert
        v-for="alert in raid.criticalAlerts"
        :key="alert.message"
        :title="alert.message"
        color="red"
        icon="i-heroicons-x-circle"
        variant="soft"
      />
    </div>

    <!-- Chargement initial -->
    <div v-if="raid.loading && !raid.overview" class="text-center py-16 text-gray-500">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin w-8 h-8 mb-2 mx-auto" />
      <p>Scan RAID en cours…</p>
    </div>

    <!-- Erreur -->
    <UAlert
      v-if="raid.error"
      :title="raid.error"
      color="red"
      icon="i-heroicons-x-circle"
      variant="soft"
    />

    <!-- Onglets -->
    <div v-if="raid.overview" class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex gap-1">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md transition-colors"
          :class="activeTab === tab.key
            ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400 -mb-px'
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'"
          @click="activeTab = tab.key"
        >
          <UIcon :name="tab.icon" class="w-4 h-4" />
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Contenu onglet Overview -->
    <div v-if="activeTab === 'overview' && raid.overview" class="space-y-4">
      <!-- Outils disponibles -->
      <UCard>
        <template #header><h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Outils détectés</h3></template>
        <div class="flex flex-wrap gap-3">
          <div
            v-for="(available, tool) in raid.tools"
            :key="tool"
            class="flex items-center gap-1.5 text-xs"
            :class="available ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-600'"
          >
            <UIcon
              :name="available ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
              class="w-4 h-4"
            />
            {{ tool }}
          </div>
        </div>
      </UCard>

      <!-- Résumé cartes -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UCard>
          <div class="text-center py-2">
            <div class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ raid.controllers.length }}</div>
            <div class="text-sm text-gray-500 mt-1">Contrôleurs matériels</div>
          </div>
        </UCard>
        <UCard>
          <div class="text-center py-2">
            <div class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ raid.mdArrays.length }}</div>
            <div class="text-sm text-gray-500 mt-1">Tableaux MD (logiciel)</div>
          </div>
        </UCard>
        <UCard>
          <div class="text-center py-2">
            <div class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ raid.blockDevices.length }}</div>
            <div class="text-sm text-gray-500 mt-1">Block devices</div>
          </div>
        </UCard>
      </div>

      <!-- Toutes les alertes -->
      <div v-if="raid.allAlerts.length" class="space-y-2">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-400">Alertes ({{ raid.allAlerts.length }})</h3>
        <UAlert
          v-for="a in raid.allAlerts"
          :key="a.message"
          :title="a.message"
          :color="a.severity === 'critical' ? 'red' : a.severity === 'warning' ? 'amber' : 'blue'"
          :icon="a.severity === 'critical' ? 'i-heroicons-x-circle' : 'i-heroicons-exclamation-triangle'"
          variant="soft"
          size="sm"
        />
      </div>

      <div v-if="!raid.allAlerts.length" class="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
        <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
        Aucune alerte RAID détectée
      </div>
    </div>

    <!-- Onglet RAID Matériel -->
    <div v-else-if="activeTab === 'hardware' && raid.overview" class="space-y-4">
      <div class="flex justify-end">
        <UButton
          v-if="canCreateHwRaid && !isReadOnly"
          color="purple"
          size="sm"
          icon="i-heroicons-plus"
          @click="openHwWizard()"
        >
          Créer volume RAID matériel
        </UButton>
      </div>
      <div v-if="!raid.controllers.length" class="text-center py-8 text-gray-500">
        <UIcon name="i-heroicons-cpu-chip" class="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>Aucun contrôleur RAID matériel détecté</p>
        <p class="text-xs mt-1">StorCLI, PercCLI, MegaCLI, arcconf non disponibles et aucun contrôleur détecté via lspci.</p>
      </div>
      <UCard v-for="ctrl in raid.controllers" :key="ctrl.id">
        <RaidControllerCard
          :controller="ctrl"
          :read-only="isReadOnly"
          @create-ld="(c) => openHwWizard(c)"
          @delete-ld="(c, ld) => handleDeleteHwLd(c, ld)"
          @diagnostic="openDiagnostic"
        />
      </UCard>
    </div>

    <!-- Onglet RAID Logiciel (MD) -->
    <div v-else-if="activeTab === 'software' && raid.overview" class="space-y-4">
      <div class="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p class="font-semibold">{{ t('raid.workflow.title') }}</p>
        <ol class="mt-1 list-decimal pl-5 space-y-0.5">
          <li>{{ t('raid.workflow.step_prepare') }}</li>
          <li>{{ t('raid.workflow.step_create') }}</li>
          <li>{{ t('raid.workflow.step_use') }}</li>
        </ol>
      </div>
      <UAlert
        v-if="isClusteredSan"
        title="Changement stockage cluster-aware requis"
        description="Ce SAN appartient à un cluster HA. Sync config ne crée pas les partitions, superblocks MD, métadonnées LVM ni block devices sur les autres nœuds ; les wizards RAID exécutent donc un préflight cluster et bloquent l'écriture tant que l'exécution multi-nœud n'est pas disponible."
        color="amber"
        icon="i-heroicons-exclamation-triangle"
      />
      <div class="flex justify-end gap-2">
        <UButton
          v-if="!isReadOnly"
          color="amber"
          size="sm"
          icon="i-heroicons-circle-stack"
          @click="openPrepareMdPartitionsWizard()"
        >
          {{ t('raid.prepare_partitions.action') }}
        </UButton>
        <UButton
          v-if="!isReadOnly"
          color="blue"
          size="sm"
          icon="i-heroicons-plus"
          @click="openMdWizard()"
        >
          {{ t('raid.create_md.action') }}
        </UButton>
      </div>
      <div
        v-if="!raid.mdArrays.length && !raid.stoppedMdArrays.length"
        class="text-center py-8 text-gray-500"
      >
        <UIcon name="i-heroicons-server-stack" class="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>Aucun tableau MD détecté</p>
        <p class="text-xs mt-1">Utilisez le bouton "Créer tableau MD" pour en créer un</p>
      </div>
      <div v-if="raid.mdArrays.length" class="space-y-3">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Tableaux MD actifs</h3>
        <UCard
          v-for="arr in raid.mdArrays"
          :key="arr.path"
          :id="mdArrayDomId(arr)"
          :class="{ 'ring-2 ring-blue-500 ring-offset-1': arr.path === highlightedArrayPath }"
        >
          <MdArrayCard
            :array="arr"
            @stop="handleStopMd"
            @add-device="handleAddMdDevice"
            @set-faulty="(arr, m) => handleSetFaulty(arr, m)"
            @remove-device="(arr, m) => handleRemoveMdDevice(arr, m)"
          />
        </UCard>
      </div>

      <div v-if="raid.stoppedMdArrays.length" class="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <div>
          <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('raid.stopped_md.section_title') }}</h3>
          <p class="text-xs text-gray-500 mt-1">{{ t('raid.stopped_md.section_description') }}</p>
        </div>
        <UAlert
          v-if="isClusteredSan"
          :title="t('raid.stopped_md.cluster_notice')"
          color="amber"
          icon="i-heroicons-exclamation-triangle"
          variant="soft"
        />
        <UCard v-for="arr in raid.stoppedMdArrays" :key="stoppedArrayKey(arr)">
          <StoppedMdArrayCard
            :array="arr"
            :read-only="isReadOnly"
            :action-loading="stoppedMdActionKey === stoppedArrayKey(arr)"
            @assemble="handleAssembleStoppedMd"
            @zero-superblocks="handleZeroStoppedMd"
            @inspect="handleInspectStoppedMd"
          />
        </UCard>
      </div>
    </div>

    <!-- Onglet Block Devices -->
    <div v-else-if="activeTab === 'devices' && raid.overview" class="space-y-3">
      <div class="flex items-center gap-3">
        <UInput v-model="deviceFilter" placeholder="Filtrer…" size="sm" class="max-w-xs" />
        <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
          <input v-model="showOnlyEligible" type="checkbox" class="accent-blue-500" />
          Éligibles seulement
        </label>
      </div>
      <UCard>
        <RaidBlockDevicesTable :devices="filteredDevices" />
      </UCard>
    </div>

    <!-- Onglet Opérations -->
    <div v-else-if="activeTab === 'ops'" class="space-y-3">
      <div v-if="!raid.operations.length" class="text-center py-8 text-gray-500">
        <UIcon name="i-heroicons-queue-list" class="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>Aucune opération RAID enregistrée</p>
      </div>
      <UCard
        v-for="op in raid.operations"
        :key="op.id"
      >
        <div class="space-y-3">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-gray-900 dark:text-gray-200">{{ op.summary }}</span>
                <UBadge :color="opStatusColor(op.status)" :label="op.status" size="xs" variant="soft" />
                <RaidRiskBadge :risk="op.riskLevel" />
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                {{ new Date(op.createdAt).toLocaleString() }} — par {{ op.createdBy }}
              </div>
            </div>
            <UButton
              v-if="op.status === 'planned' || op.status === 'running'"
              size="xs"
              color="gray"
              variant="ghost"
              icon="i-heroicons-stop"
              @click="cancelOp(op.id)"
            >
              Annuler
            </UButton>
          </div>
          <RaidOperationTimeline v-if="op.steps.length" :steps="op.steps" />
          <p v-if="op.error" class="text-xs text-red-400">{{ op.error }}</p>
        </div>
      </UCard>
    </div>

    <!-- Inspect métadonnées MD arrêté -->
    <div
      v-if="stoppedInspectOpen"
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto p-4"
      @click.self="stoppedInspectOpen = false"
    >
      <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl mt-8 mb-8 outline-none">
        <div class="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-200 dark:border-gray-700">
          <h2 class="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <UIcon name="i-heroicons-magnifying-glass" class="w-5 h-5 text-gray-400" />
            {{ t('raid.stopped_md.inspect_title') }}
          </h2>
          <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" size="sm" @click="stoppedInspectOpen = false" />
        </div>
        <div class="px-5 py-4 space-y-3">
          <p v-if="stoppedInspectLabel" class="text-sm text-gray-600 dark:text-gray-400 font-mono">{{ stoppedInspectLabel }}</p>
          <pre class="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 overflow-x-auto whitespace-pre-wrap text-gray-700 dark:text-gray-300">{{ stoppedInspectText || '(aucune sortie mdadm --examine)' }}</pre>
          <div class="flex justify-end">
            <UButton size="sm" color="gray" variant="soft" icon="i-heroicons-clipboard-document" @click="copyStoppedInspect">
              Copier
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal diagnostic matériel -->
    <div
      v-if="showDiagnostic"
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto p-4"
      @click.self="showDiagnostic = false"
    >
      <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl mt-8 mb-8 outline-none">
        <div class="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-200 dark:border-gray-700">
          <h2 class="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <UIcon name="i-heroicons-magnifying-glass" class="w-5 h-5 text-gray-400" />
            Diagnostic RAID matériel
          </h2>
          <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" size="sm" @click="showDiagnostic = false" />
        </div>
        <div class="px-5 py-4 space-y-4">
          <div v-if="diagnosticLoading" class="text-center py-8 text-gray-400">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin w-6 h-6 mx-auto mb-2" />
            Collecte en cours…
          </div>
          <template v-else-if="diagnosticData">
            <!-- Résumé mode contrôleur (données parsées) -->
            <div v-if="diagnosticCtrl && ctrlModeLabel" class="rounded-lg border p-3 space-y-2"
              :class="{
                'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40':  diagnosticCtrl.controllerMode?.mode === 'raid',
                'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40': diagnosticCtrl.controllerMode?.mode === 'hba',
                'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/40': diagnosticCtrl.controllerMode?.mode === 'mixed',
                'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800': diagnosticCtrl.controllerMode?.mode === 'unknown',
              }"
            >
              <div class="flex items-center gap-2 flex-wrap">
                <UIcon
                  :name="diagnosticCtrl.controllerMode?.mode === 'hba' ? 'i-heroicons-arrows-right-left' : 'i-heroicons-cpu-chip'"
                  class="w-4 h-4 shrink-0"
                  :class="{
                    'text-blue-600': diagnosticCtrl.controllerMode?.mode === 'raid',
                    'text-amber-600': diagnosticCtrl.controllerMode?.mode === 'hba',
                    'text-purple-600': diagnosticCtrl.controllerMode?.mode === 'mixed',
                    'text-gray-500': diagnosticCtrl.controllerMode?.mode === 'unknown',
                  }"
                />
                <span class="font-semibold text-sm text-gray-800 dark:text-gray-100">{{ diagnosticCtrl.model }}</span>
                <UBadge :label="ctrlModeLabel" :color="ctrlModeColor" variant="soft" size="sm" />
                <span v-if="ctrlConfidenceLabel" class="text-xs text-gray-400">({{ ctrlConfidenceLabel }})</span>
              </div>
              <ul v-if="diagnosticCtrl.controllerMode?.evidence?.length" class="space-y-0.5 pl-6 list-disc text-xs text-gray-600 dark:text-gray-400">
                <li v-for="(e, i) in diagnosticCtrl.controllerMode.evidence" :key="i">{{ e }}</li>
              </ul>
            </div>

            <!-- Sections brutes -->
            <div v-for="(value, key) in diagnosticSections" :key="key" class="space-y-1">
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ key }}</p>
              <pre class="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 overflow-x-auto whitespace-pre-wrap text-gray-700 dark:text-gray-300">{{ value || '(vide)' }}</pre>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CreateMdArrayWizardConfirmPayload, MdArray, MdMemberDevice, HardwareRaidController, HardwareRaidLogicalDrive, RaidPreflightResult, StoppedMdArray, ZeroMdSuperblockPartitionResult } from '~/types/raid'
import type { SanSummary } from '~/server/db/repositories/san.repository'
import {
  extractFetchError,
  getZeroCleanupErrorResults,
  isModalDismiss,
  isValidMdArrayName,
  isZeroCleanupFullyVerified,
  membersStillInStoppedArrays,
  stoppedArrayKey,
  stoppedMemberPaths,
  suggestDefaultMdName,
} from '~/utils/stopped-md'

definePageMeta({ layout: 'default', ssr: false })

const route = useRoute()
const sanId = route.params.id as string

const { data: san } = await useFetch<SanSummary>(`/api/admin/sans/${sanId}`)

const isReadOnly = computed(() => san.value?.readOnly ?? false)
const isClusteredSan = computed(() => Boolean(san.value?.clusterId))

const raid = useRaidStore()
const { t } = useEsosI18n()
const toast = useAppToast()

const tabs = [
  { key: 'overview', label: 'Aperçu',           icon: 'i-heroicons-chart-bar' },
  { key: 'hardware', label: 'RAID Matériel',     icon: 'i-heroicons-cpu-chip' },
  { key: 'software', label: 'RAID Logiciel (MD)', icon: 'i-heroicons-server-stack' },
  { key: 'devices',  label: 'Block Devices',     icon: 'i-heroicons-circle-stack' },
  { key: 'ops',      label: 'Opérations',        icon: 'i-heroicons-queue-list' },
]
const activeTab = ref('overview')
const highlightedArrayPath = ref<string | null>(null)

// Wizards & modals
const { open: openModal } = useAppModal()

function mdArrayDomId(arr: MdArray): string {
  return `md-array-${arr.name}`
}

async function scrollToHighlightedArray(arrayPath: string) {
  await nextTick()
  const name = arrayPath.replace(/^\/dev\//, '')
  document.getElementById(`md-array-${name}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function isMdCreateConfirmPayload(value: unknown): value is CreateMdArrayWizardConfirmPayload {
  return typeof value === 'object'
    && value !== null
    && 'action' in value
    && 'arrayPath' in value
    && ((value as CreateMdArrayWizardConfirmPayload).action === 'view-array'
      || (value as CreateMdArrayWizardConfirmPayload).action === 'close')
}

async function openMdWizard() {
  highlightedArrayPath.value = null
  const { default: Wizard } = await import('~/components/raid/CreateMdArrayWizard.vue')
  try {
    const result = await openModal({
      component: Wizard,
      props: { blockDevices: raid.blockDevices, sourceSanId: sanId, clusterId: san.value?.clusterId, persistent: true },
    })
    if (!isMdCreateConfirmPayload(result)) return
    if (!result.overviewRefreshed) {
      await raid.fetchOverview(true)
    }
    if (result.action === 'view-array') {
      activeTab.value = 'software'
      highlightedArrayPath.value = result.arrayPath
      await scrollToHighlightedArray(result.arrayPath)
    }
  } catch { /* annulé */ }
}

async function openPrepareMdPartitionsWizard() {
  const { default: Wizard } = await import('~/components/raid/PrepareMdPartitionsWizard.vue')
  try {
    const continueToMd = await openModal({ component: Wizard, props: { blockDevices: raid.blockDevices, sourceSanId: sanId, clusterId: san.value?.clusterId, persistent: true } })
    await raid.fetchOverview(true)
    if (continueToMd) await openMdWizard()
  } catch { /* annulé */ }
}

async function openHwWizard(ctrl?: HardwareRaidController) {
  const { default: Wizard } = await import('~/components/raid/CreateHardwareRaidWizard.vue')
  try {
    await openModal({ component: Wizard, props: { controllers: raid.controllers, persistent: true } })
    await raid.fetchOverview(true)
  } catch { /* annulé */ }
}

// Block device filter
const deviceFilter = ref('')
const showOnlyEligible = ref(false)

// Diagnostic matériel
const diagnosticData = ref<null | {
  collectedAt: number
  ctrlMode: string
  lspci: string
  lsmod: string
  dmesg: string
  lsscsi: string
  whichCli: string
  directPaths: string
}>(null)
const diagnosticCtrl = ref<HardwareRaidController | null>(null)
const diagnosticLoading = ref(false)
const showDiagnostic = ref(false)

async function openDiagnostic(ctrl?: HardwareRaidController) {
  diagnosticCtrl.value = ctrl ?? null
  showDiagnostic.value = true
  diagnosticLoading.value = true
  try {
    diagnosticData.value = await $fetch(`/api/raid/hardware/diagnostic${sanId ? `?sanId=${sanId}` : ''}`)
  } catch (err: any) {
    alert(err?.data?.statusMessage ?? err.message)
  } finally {
    diagnosticLoading.value = false
  }
}

const filteredDevices = computed(() => {
  let list = raid.blockDevices
  if (deviceFilter.value) list = list.filter(d => d.path.includes(deviceFilter.value))
  if (showOnlyEligible.value) list = list.filter(d => d.eligibleForMd || d.eligibleForHardwareRaid)
  return list
})

const diagnosticSections = computed(() => {
  if (!diagnosticData.value) return {}
  const d = diagnosticData.value
  return {
    'Mode contrôleur (perccli/storcli)': d.ctrlMode,
    'lspci (contrôleurs PCI)': d.lspci,
    'lsmod (modules kernel)': d.lsmod,
    'dmesg (messages RAID)': d.dmesg,
    'lsscsi (volumes SCSI)': d.lsscsi,
    'CLI disponibles (which)': d.whichCli,
    'Chemins directs détectés': d.directPaths,
  }
})

// Labels pour affichage mode contrôleur parsé
const ctrlModeLabel = computed(() => {
  const m = diagnosticCtrl.value?.controllerMode?.mode
  if (!m) return null
  return { raid: 'Mode RAID', hba: 'Mode HBA / IT', mixed: 'Mode Mixte RAID+HBA', unknown: 'Mode inconnu' }[m] ?? m
})

const ctrlModeColor = computed(() => {
  const m = diagnosticCtrl.value?.controllerMode?.mode
  if (!m) return 'gray'
  return { raid: 'blue', hba: 'amber', mixed: 'purple', unknown: 'gray' }[m] ?? 'gray'
})

const ctrlConfidenceLabel = computed(() => {
  const c = diagnosticCtrl.value?.controllerMode?.confidence
  if (!c) return null
  return { high: 'confiance haute', medium: 'confiance moyenne', low: 'confiance faible' }[c] ?? c
})

// Stopped MD inspect / assemble / zero
const stoppedInspectOpen = ref(false)
const stoppedInspectText = ref('')
const stoppedInspectLabel = ref('')
const stoppedMdActionKey = ref<string | null>(null)

async function resolveAssembleTargetName(arr: StoppedMdArray): Promise<string | null> {
  if (isValidMdArrayName(arr.name)) return arr.name
  const suggested = suggestDefaultMdName(raid.overview)
  const input = window.prompt(t('raid.stopped_md.target_name_prompt'), suggested)
  if (!input?.trim()) return null
  const trimmed = input.trim()
  if (!isValidMdArrayName(trimmed)) {
    toast.error(t('raid.stopped_md.target_name_invalid'))
    return null
  }
  return trimmed
}

function buildZeroSuperblockDescription(arr: StoppedMdArray, members: string[]): string {
  const isOrphan = arr.name === 'unknown' || arr.members.some(m => m.memberStatus === 'orphan_metadata')
  const lines = [
    isOrphan ? t('raid.stopped_md.zero_orphan_description') : t('raid.stopped_md.zero_description'),
    '',
    `${t('raid.stopped_md.zero_partitions_label')} : ${members.join(', ')}`,
    t('raid.stopped_md.zero_reassembly_warning'),
  ]
  return lines.join('\n')
}

function zeroSuperblockPreflightPayload(arr: StoppedMdArray, members: string[]) {
  const payload: { members: string[]; uuid?: string; name?: string } = { members, uuid: arr.uuid }
  if (isValidMdArrayName(arr.name)) payload.name = arr.name
  return payload
}

async function handleZeroStoppedMd(arr: StoppedMdArray) {
  const key = stoppedArrayKey(arr)
  stoppedMdActionKey.value = key
  try {
    const members = stoppedMemberPaths(arr)
    if (!members.length) {
      toast.warning(t('raid.stopped_md.zero_no_members'))
      return
    }
    const confirmPhrase = t('raid.stopped_md.zero_confirm_phrase')
    let preflight: RaidPreflightResult | null = null
    try {
      preflight = await raid.preflight({
        backend: 'software_md',
        action: 'zero_md_superblocks',
        payload: zeroSuperblockPreflightPayload(arr, members),
      })
      if (!preflight.ok) {
        toast.warning(t('raid.stopped_md.toast_preflight_blocked'), preflight.blockers[0])
      }
    } catch (err: unknown) {
      toast.error(t('raid.stopped_md.toast_action_failed'), extractFetchError(err))
      return
    }

    const isOrphan = arr.name === 'unknown' || arr.members.some(m => m.memberStatus === 'orphan_metadata')
    const { default: Modal } = await import('~/components/raid/RaidDestructiveConfirmModal.vue')
    try {
      const confirmation = await openModal({
        component: Modal,
        props: {
          title: isOrphan ? t('raid.stopped_md.zero_orphan_title') : t('raid.stopped_md.zero_title'),
          description: buildZeroSuperblockDescription(arr, members),
          riskLevel: 'destructive',
          confirmationPhrase: preflight?.requiredConfirmation ?? confirmPhrase,
          preflight,
          persistent: true,
        },
      })
      const apiPayload: { members: string[]; confirmation: string; uuid?: string; name?: string } = {
        members,
        confirmation: confirmation as string,
      }
      if (arr.uuid) apiPayload.uuid = arr.uuid
      if (isValidMdArrayName(arr.name)) apiPayload.name = arr.name

      console.info('[raid-ui:zero-superblock]', { sanId, members, arrayKey: key, payload: apiPayload })
      const result = await raid.zeroMdSuperblocks(apiPayload)
      console.info('[raid-ui:zero-superblock]', { result })

      if (!isZeroCleanupFullyVerified(result)) {
        const failed = result.results.find(r => !r.success || r.verifiedRemoved !== true)
        if (failed?.diagnostics) {
          await showZeroCleanupDiagnosticsModal(result.results)
        } else if (failed?.verifiedRemoved === false) {
          toast.error(
            t('raid.stopped_md.toast_zero_not_verified', { partition: failed.partition }),
            failed.stdout?.slice(-200),
          )
        } else if (result.warnings.length) {
          toast.warning(t('raid.stopped_md.toast_zero_partial'), result.warnings.join(' · '))
        } else {
          toast.warning(t('raid.stopped_md.toast_action_failed'), extractFetchError({ message: 'Vérification incomplète' }))
        }
        return
      }

      const stillVisible = membersStillInStoppedArrays(members, raid.stoppedMdArrays)
      if (stillVisible.length) {
        toast.warning(t('raid.stopped_md.toast_zero_still_visible', { partitions: stillVisible.join(', ') }))
        return
      }

      toast.success(t('raid.stopped_md.toast_zero_ok', { partitions: members.join(', ') }))
    } catch (err: unknown) {
      if (isModalDismiss(err)) return
      const errorResults = getZeroCleanupErrorResults(err)
      if (errorResults.some(r => r.diagnostics)) {
        toast.error(t('raid.stopped_md.diagnostics_title'), extractFetchError(err))
        await showZeroCleanupDiagnosticsModal(errorResults)
        return
      }
      toast.error(t('raid.stopped_md.toast_action_failed'), extractFetchError(err))
    }
  } finally {
    stoppedMdActionKey.value = null
  }
}

async function showZeroCleanupDiagnosticsModal(results: ZeroMdSuperblockPartitionResult[]) {
  const { default: DiagnosticsModal } = await import('~/components/raid/StoppedMdCleanupDiagnosticsModal.vue')
  try {
    const action = await openModal({
      component: DiagnosticsModal,
      props: { results, persistent: true },
    })
    if (action === 'wipe') {
      await handleWipeMdSignatures(results)
    }
  } catch { /* annulé */ }
}

async function handleWipeMdSignatures(diagnosticsResults: ZeroMdSuperblockPartitionResult[]) {
  const members = diagnosticsResults.map(r => r.partition)
  const remainingSignatureTypes = Object.fromEntries(
    diagnosticsResults
      .filter(r => (r.diagnostics?.remainingSignatureTypes?.length ?? 0) > 0)
      .map(r => [r.partition, r.diagnostics!.remainingSignatureTypes]),
  )

  let preflight: RaidPreflightResult | null = null
  try {
    preflight = await raid.preflight({
      backend: 'software_md',
      action: 'wipe_md_signatures',
      payload: { members, remainingSignatureTypes },
    })
    if (!preflight.ok) {
      toast.warning(t('raid.stopped_md.toast_preflight_blocked'), preflight.blockers[0])
      return
    }
  } catch (err: unknown) {
    toast.error(t('raid.stopped_md.toast_action_failed'), extractFetchError(err))
    return
  }

  const confirmPhrase = t('raid.stopped_md.wipe_signatures_confirm_phrase')
  const { default: Modal } = await import('~/components/raid/RaidDestructiveConfirmModal.vue')
  try {
    const confirmation = await openModal({
      component: Modal,
      props: {
        title: t('raid.stopped_md.wipe_signatures'),
        description: [
          t('raid.stopped_md.wipe_signatures_help'),
          '',
          `${t('raid.stopped_md.zero_partitions_label')} : ${members.join(', ')}`,
        ].join('\n'),
        riskLevel: 'destructive',
        confirmationPhrase: preflight?.requiredConfirmation ?? confirmPhrase,
        preflight,
        persistent: true,
      },
    })

    const result = await raid.wipeMdSignatures({
      members,
      confirmation: confirmation as string,
      remainingSignatureTypes,
    })

    if (!isZeroCleanupFullyVerified(result)) {
      const failed = result.results.find(r => !r.success || r.verifiedRemoved !== true)
      if (failed?.diagnostics) {
        await showZeroCleanupDiagnosticsModal(result.results)
      } else {
        toast.warning(t('raid.stopped_md.toast_zero_partial'), result.warnings.join(' · '))
      }
      return
    }

    const stillVisible = membersStillInStoppedArrays(members, raid.stoppedMdArrays)
    if (stillVisible.length) {
      toast.warning(t('raid.stopped_md.toast_zero_still_visible', { partitions: stillVisible.join(', ') }))
      return
    }

    toast.success(t('raid.stopped_md.toast_wipe_ok', { partitions: members.join(', ') }))
  } catch (err: unknown) {
    if (isModalDismiss(err)) return
    const errorResults = getZeroCleanupErrorResults(err)
    if (errorResults.some(r => r.diagnostics)) {
      toast.error(t('raid.stopped_md.diagnostics_title'), extractFetchError(err))
      await showZeroCleanupDiagnosticsModal(errorResults)
      return
    }
    toast.error(t('raid.stopped_md.toast_action_failed'), extractFetchError(err))
  }
}

function handleInspectStoppedMd(arr: StoppedMdArray) {
  stoppedInspectLabel.value = arr.path ?? `/dev/${arr.name}`
  const chunks = arr.members
    .map(m => m.mdExamine?.raw?.trim())
    .filter((raw): raw is string => Boolean(raw))
  stoppedInspectText.value = chunks.length
    ? chunks.join('\n\n---\n\n')
    : arr.members.map(m => `${m.path}:\n(aucune métadonnée examine en cache)`).join('\n\n')
  stoppedInspectOpen.value = true
}

async function copyStoppedInspect() {
  if (!stoppedInspectText.value) return
  try {
    await navigator.clipboard.writeText(stoppedInspectText.value)
  } catch { /* ignore */ }
}

async function handleAssembleStoppedMd(arr: StoppedMdArray) {
  const key = stoppedArrayKey(arr)
  stoppedMdActionKey.value = key
  try {
    const targetName = await resolveAssembleTargetName(arr)
    if (!targetName) return

    const path = `/dev/${targetName}`
    const members = stoppedMemberPaths(arr)
    let preflight: RaidPreflightResult | null = null
    let phrase = ''
    try {
      preflight = await raid.preflight({
        backend: 'software_md',
        action: 'assemble_md',
        payload: { name: arr.name, uuid: arr.uuid, members, targetName },
      })
      phrase = preflight.requiredConfirmation
      if (!preflight.ok) {
        toast.warning(t('raid.stopped_md.toast_preflight_blocked'), preflight.blockers[0])
      }
    } catch (err: unknown) {
      toast.error(t('raid.stopped_md.toast_action_failed'), extractFetchError(err))
      return
    }

    const { default: Modal } = await import('~/components/raid/RaidDestructiveConfirmModal.vue')
    try {
      const confirmation = await openModal({
        component: Modal,
        props: {
          title: t('raid.stopped_md.assemble_title'),
          description: t('raid.stopped_md.assemble_description', { path }),
          riskLevel: 'risky',
          confirmationPhrase: phrase || undefined,
          preflight,
          persistent: true,
        },
      })
      await raid.assembleMdArray({
        name: arr.name,
        uuid: arr.uuid,
        members: members.length ? members : undefined,
        targetName: targetName !== arr.name ? targetName : undefined,
        confirmation: confirmation as string,
      })
      toast.success(t('raid.stopped_md.toast_assemble_ok', { path }))
      activeTab.value = 'software'
      highlightedArrayPath.value = path
      await scrollToHighlightedArray(path)
    } catch (err: unknown) {
      if (isModalDismiss(err)) return
      toast.error(t('raid.stopped_md.toast_action_failed'), extractFetchError(err))
    }
  } finally {
    stoppedMdActionKey.value = null
  }
}

// Stop MD
async function handleStopMd(arr: MdArray) {
  let preflight: RaidPreflightResult | null = null
  let phrase = ''
  try {
    preflight = await raid.preflight({ backend: 'software_md', action: 'stop_md', payload: { name: arr.name } })
    phrase = preflight.requiredConfirmation
  } catch { /* non bloquant */ }
  const { default: Modal } = await import('~/components/raid/RaidDestructiveConfirmModal.vue')
  try {
    const confirmation = await openModal({
      component: Modal,
      props: {
        title: 'Arrêter le tableau MD',
        description: `Voulez-vous vraiment arrêter ${arr.name} ? Cette opération est réversible mais interrompra l'accès au volume.`,
        riskLevel: 'risky',
        confirmationPhrase: phrase || undefined,
        preflight,
        persistent: true,
      },
    })
    await raid.stopMdArray(arr.name, confirmation as string)
  } catch { /* annulé */ }
}

// Delete HW LD
async function handleDeleteHwLd(ctrl: HardwareRaidController, ld: HardwareRaidLogicalDrive) {
  let preflight: RaidPreflightResult | null = null
  let phrase = ''
  try {
    preflight = await raid.preflight({ backend: 'hardware', action: 'delete_hw_ld', payload: { controllerId: ctrl.id, ldId: ld.id } })
    phrase = preflight.requiredConfirmation
  } catch { /* non bloquant */ }
  const { default: Modal } = await import('~/components/raid/RaidDestructiveConfirmModal.vue')
  try {
    const confirmation = await openModal({
      component: Modal,
      props: {
        title: 'Supprimer le volume logique matériel',
        description: `Suppression du volume ${ld.id}. TOUTES LES DONNÉES SERONT EFFACÉES.`,
        riskLevel: 'destructive',
        confirmationPhrase: phrase || undefined,
        preflight,
        persistent: true,
      },
    })
    await raid.deleteHardwareLogicalDrive(ld.id, confirmation as string)
  } catch { /* annulé */ }
}

async function handleAddMdDevice(arr: MdArray) {
  const device = window.prompt(`Chemin du device à ajouter à ${arr.path} (ex: /dev/sdb) :`)
  if (!device?.trim()) return
  try {
    await raid.addMdDevice(arr.name, device.trim())
  } catch (err: any) {
    alert(err?.data?.statusMessage ?? err.message)
  }
}

async function handleSetFaulty(arr: MdArray, member: MdMemberDevice) {
  if (!member.path) return
  if (!confirm(`Marquer ${member.path} comme faulty dans ${arr.path} ?`)) return
  try {
    await raid.setMdDeviceFaulty(arr.name, member.path)
  } catch (err: any) {
    alert(err?.data?.statusMessage ?? err.message)
  }
}

async function handleRemoveMdDevice(arr: MdArray, member: MdMemberDevice) {
  if (!member.path) return
  if (!confirm(`Retirer ${member.path} de ${arr.path} ?`)) return
  const confirmation = window.prompt(`Saisissez REMOVE ${member.path.split('/').pop()} pour confirmer :`)
  if (!confirmation) return
  try {
    await raid.removeMdDevice(arr.name, member.path, confirmation)
  } catch (err: any) {
    alert(err?.data?.statusMessage ?? err.message)
  }
}

async function cancelOp(id: string) {
  await $fetch(`/api/raid/operations/${id}/cancel`, { method: 'POST' })
  await raid.fetchOperations()
}

function opStatusColor(s: string) {
  if (s === 'success') return 'green'
  if (s === 'failed') return 'red'
  if (s === 'running') return 'amber'
  if (s === 'cancelled') return 'gray'
  return 'blue'
}

const canCreateHwRaid = computed(() =>
  raid.controllers.some(c => c.supportsCreate),
)

onMounted(() => {
  raid.sanId = sanId
  raid.startPolling(10_000)
})

onUnmounted(() => {
  raid.stopPolling()
  raid.sanId = null
})
</script>
