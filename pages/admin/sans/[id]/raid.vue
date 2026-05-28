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
          <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100">{{ t('raid.page.title') }}</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">{{ san?.label ?? sanId }}</p>
        </div>
        <RaidPerSanHealthBadges
          :page-health="pageRaidHealth"
          :local-health="perSanHealth.localHealth"
          :cluster-health="perSanHealth.clusterHealth"
          :is-clustered="isClusteredSan"
        />
      </div>
      <div class="flex items-center gap-2">
        <span v-if="raid.overview" class="text-xs text-gray-600 dark:text-gray-400">
          {{ t('raid.page.scan_at', { time: new Date(raid.overview.scannedAt).toLocaleTimeString() }) }}
        </span>
        <span
          v-if="raid.autoRefreshActive"
          class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
          {{ t('raid.progress.auto_refresh_active') }}
        </span>
        <UButton
          size="sm"
          color="gray"
          variant="ghost"
          icon="i-heroicons-arrow-path"
          :loading="raid.loading || raid.polling"
          @click="manualRefreshRaid"
        >
          {{ t('raid.page.refresh') }}
        </UButton>
        <UButton
          size="sm"
          color="gray"
          variant="outline"
          icon="i-heroicons-squares-plus"
          :to="advancedStorageLink"
        >
          {{ t('nav.items.advanced_storage') }}
        </UButton>
      </div>
    </div>

    <StorageReadOnlyBanner :read-only="isReadOnly" />

    <!-- Alertes critiques -->
    <div v-if="raid.criticalAlerts.length" class="space-y-2">
      <UAlert
        v-for="alert in raid.criticalAlerts"
        :key="alert.code ?? alert.message"
        :title="tRaidAlert(alert)"
        color="red"
        icon="i-heroicons-x-circle"
        variant="soft"
      />
    </div>

    <!-- Chargement initial -->
    <div v-if="raid.loading && !raid.overview" class="text-center py-16 text-gray-500 dark:text-gray-400">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin w-8 h-8 mb-2 mx-auto" />
      <p>{{ t('raid.page.scan_in_progress') }}</p>
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
        <template #header><h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('raid.page.tools_detected') }}</h3></template>
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
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <UCard>
          <div class="text-center py-2">
            <div class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ raid.controllers.length }}</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t('raid.page.hw_controllers') }}</div>
          </div>
        </UCard>
        <UCard>
          <div class="text-center py-2">
            <div class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ raid.mdSoftwareCount }}</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t('raid.md_detection.overview_count_label') }}</div>
          </div>
        </UCard>
        <UCard>
          <div class="text-center py-2">
            <div class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ raid.blockDevices.length }}</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t('raid.page.block_devices') }}</div>
          </div>
        </UCard>
        <UCard>
          <div class="py-2 px-1 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('lvm.overview.raid_summary.title') }}</div>
              <UBadge
                :color="lvmSummaryBadgeColor"
                variant="soft"
                size="xs"
                :label="t(lvmRaidSummary.stateKey)"
              />
            </div>
            <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
              {{ t(lvmRaidSummary.detailKey, lvmRaidSummary.detailParams ?? {}) }}
            </p>
            <p class="text-xs text-primary-700 dark:text-primary-300">
              {{ t(lvmRaidSummary.nextStepKey, lvmRaidSummary.nextStepParams ?? {}) }}
            </p>
            <p
              v-if="lvmClusterStorageHint"
              class="text-xs text-red-700 dark:text-red-400 font-medium"
            >
              {{ lvmClusterStorageHint }}
            </p>
            <p class="text-[11px] text-gray-500 dark:text-gray-400">
              {{ t(lvmRaidSummary.countsLabelKey, lvmRaidSummary.countsParams) }}
            </p>
            <UAlert
              v-if="lvmRaidSummary.status === 'unavailable'"
              color="amber"
              variant="soft"
              size="sm"
              :title="t('lvm.overview.raid_summary.load_warning')"
            />
            <p
              v-else-if="lvmRaidSummary.issueMessages.length"
              class="text-xs text-amber-700 dark:text-amber-300"
            >
              {{ lvmRaidSummary.issueMessages.slice(0, 2).join(' · ') }}
            </p>
            <UButton size="xs" color="primary" variant="soft" block @click="openLvmFromRaidSummary">
              {{ t(lvmRaidSummary.primaryActionLabelKey) }}
            </UButton>
          </div>
        </UCard>
      </div>

      <RaidClusterStorageAlertCard :model="clusterAlertCard" />

      <div v-if="clusterOverviewAlerts.length" class="space-y-2">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-400">
          {{ t('raid.overview.cluster_alerts_title', { count: clusterOverviewAlerts.length }) }}
        </h3>
        <UAlert
          v-for="p in clusterOverviewAlerts"
          :key="p.id"
          :title="p.title"
          :description="p.summary"
          :color="p.severity === 'critical' || p.severity === 'blocking' ? 'red' : 'amber'"
          icon="i-heroicons-server-stack"
          variant="soft"
          size="sm"
        />
      </div>

      <div v-if="raid.allAlerts.length" class="space-y-2">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-400">
          {{ t('raid.overview.local_alerts_title', { count: raid.allAlerts.length }) }}
        </h3>
        <UAlert
          v-for="a in raid.allAlerts"
          :key="a.code ?? a.message"
          :title="tRaidAlert(a)"
          :color="a.severity === 'critical' ? 'red' : a.severity === 'warning' ? 'amber' : 'blue'"
          :icon="a.severity === 'critical' ? 'i-heroicons-x-circle' : 'i-heroicons-exclamation-triangle'"
          variant="soft"
          size="sm"
        />
      </div>

      <div
        v-if="!raid.allAlerts.length"
        class="text-sm flex items-center gap-2"
        :class="clusterOverviewAlerts.length ? 'text-gray-600 dark:text-gray-400' : 'text-green-600 dark:text-green-400'"
      >
        <UIcon
          :name="clusterOverviewAlerts.length ? 'i-heroicons-information-circle' : 'i-heroicons-check-circle'"
          class="w-4 h-4"
        />
        {{ t('raid.overview.no_local_alerts') }}
      </div>
      <p
        v-if="!raid.allAlerts.length && perSanHealth.isClusterCritical"
        class="text-sm text-red-600 dark:text-red-400 flex items-center gap-2 font-medium"
      >
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
        {{ t('raid.overview.cluster_critical_hint') }}
      </p>
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
          {{ t('raid.page.create_hw_volume') }}
        </UButton>
      </div>
      <div v-if="!raid.controllers.length" class="text-center py-8 text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-cpu-chip" class="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>{{ t('raid.page.hw_empty') }}</p>
        <p class="text-xs mt-1">{{ t('raid.page.hw_empty_hint') }}</p>
      </div>
      <UCard v-for="ctrl in raid.controllers" :key="ctrl.id">
        <RaidControllerCard
          :controller="ctrl"
          :read-only="isReadOnly"
          :show-missing-tools-action="ctrl.managementMode === 'read_only_limited' && !isReadOnly"
          @install-perccli="openMissingPerccliWizard"
          @create-ld="(c) => openHwWizard(c)"
          @delete-ld="(c, ld) => handleDeleteHwLd(c, ld)"
          @diagnostic="openDiagnostic"
        />
      </UCard>
    </div>

    <!-- Onglet RAID Logiciel (MD) — cockpit opérationnel -->
    <RaidSoftwareCockpit
      v-else-if="activeTab === 'software' && raid.overview"
      :cockpit="softwareCockpit"
      :read-only="isReadOnly"
      :is-clustered="isClusteredSan"
      :current-san-id="sanId"
      :loading="raid.loading"
      :polling="raid.polling"
      :auto-refresh-active="raid.autoRefreshActive"
      :critical-alerts="raid.criticalAlerts"
      :highlighted-array-path="highlightedArrayPath"
      :assemblable="partitionedStopped.assemblable"
      :orphan-or-incomplete="partitionedStopped.orphanOrIncomplete"
      :stopped-md-action-key="stoppedMdActionKey"
      :md-blocker-items="mdBlockerItems"
      :has-hardware-raid-volumes="hasHardwareRaidBlockDevices"
      :needs-advanced-cleanup="arrayNeedsAdvancedCleanup"
      :advanced-cleanup-members-for="advancedCleanupMembersForStopped"
      :peer-raid-link="peerRaidLink"
      @prepare-partitions="openPrepareMdPartitionsWizard()"
      @create-md="openMdWizard()"
      @refresh="manualRefreshRaid()"
      @stop-md="handleStopMd"
      @add-md-member="(arr, intent) => openAddMdMemberWizard(arr, intent)"
      @set-faulty="(arr, m) => handleSetFaulty(arr, m)"
      @remove-md-device="(arr, m) => handleRemoveMdDevice(arr, m)"
      @assemble-stopped="handleAssembleStoppedMd"
      @zero-stopped="handleZeroStoppedMd"
      @advanced-cleanup-stopped="handleAdvancedCleanupStoppedMd"
      @inspect-stopped="handleInspectStoppedMd"
      @cockpit-action="onCockpitAction"
      @navigate-md-detection="navigateMdDetectionItem"
    />

    <!-- Onglet LVM -->
    <div v-else-if="activeTab === 'lvm'" class="space-y-3">
      <UAlert
        v-if="lvm.error"
        :title="lvm.error"
        color="red"
        variant="soft"
      />
      <div v-if="lvm.loading && !lvm.overview" class="text-center py-12 text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin w-8 h-8 mx-auto mb-2" />
        <p>{{ t('lvm.overview.refresh') }}…</p>
      </div>
      <LvmStoragePanel
        v-else-if="lvm.overview || !lvm.loading"
        :san-id="sanId"
        :cluster-id="san?.clusterId ?? undefined"
        :is-clustered="isClusteredSan"
        :read-only="isReadOnly"
        @navigate-block-devices="activeTab = 'devices'"
        @navigate-filesystems="activeTab = 'fs'"
      />
    </div>

    <!-- Onglet File Systems -->
    <div v-else-if="activeTab === 'fs'" class="space-y-3">
      <FsStoragePanel
        :san-id="sanId"
        :cluster-id="san?.clusterId ?? undefined"
        :is-clustered="isClusteredSan"
        :read-only="isReadOnly"
        @navigate-block-devices="onFsNavigateBlockDevices"
        @navigate-lvm="activeTab = 'lvm'"
        @create-fileio-lv="onFsCreateFileioLv"
      />
    </div>

    <!-- Onglet Block Devices -->
    <div v-else-if="activeTab === 'devices' && raid.overview" class="space-y-3">
      <div class="flex items-center gap-3">
        <UInput v-model="deviceFilter" :placeholder="t('raid.page.filter_placeholder')" size="sm" class="max-w-xs" />
        <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
          <input v-model="showOnlyEligible" type="checkbox" class="accent-blue-500" />
          {{ t('raid.page.eligible_only') }}
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
          <input v-model="showMdMetadataOnly" type="checkbox" class="accent-blue-500" />
          {{ t('raid.md_detection.filter_md_metadata') }}
        </label>
      </div>
      <UAlert
        v-if="pendingHwBackends.length"
        color="amber"
        variant="soft"
        :title="t('raid.page.pending_hw_backend.title')"
        :description="t('raid.page.pending_hw_backend.body')"
      >
        <ul class="list-disc pl-4 text-xs mt-1">
          <li v-for="row in pendingHwBackends" :key="`${row.controllerId}:${row.vdId}`">
            {{ row.controllerLabel }} {{ row.vdId }} ({{ row.status.osPath || '—' }})
          </li>
        </ul>
      </UAlert>
      <UCard>
        <RaidBlockDevicesTable
          :devices="filteredDevices"
          :controllers="raid.controllers"
          :highlight-path="highlightedDevicePath"
        />
      </UCard>
    </div>

    <!-- Onglet Opérations -->
    <div v-else-if="activeTab === 'ops'" class="space-y-3">
      <div v-if="!raid.operations.length" class="text-center py-8 text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-queue-list" class="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p>{{ t('raid.page.ops_empty') }}</p>
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
              {{ t('raid.page.cancel') }}
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
          <pre class="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 overflow-x-auto whitespace-pre-wrap text-gray-700 dark:text-gray-300">{{ stoppedInspectText || t('raid.page.inspect_no_output') }}</pre>
          <div class="flex justify-end">
            <UButton size="sm" color="gray" variant="soft" icon="i-heroicons-clipboard-document" @click="copyStoppedInspect">
              {{ t('raid.page.inspect_copy') }}
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
            {{ t('raid.page.diagnostic_hw_title') }}
          </h2>
          <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" size="sm" @click="showDiagnostic = false" />
        </div>
        <div class="px-5 py-4 space-y-4">
          <div v-if="diagnosticLoading" class="text-center py-8 text-gray-400">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin w-6 h-6 mx-auto mb-2" />
            {{ t('raid.page.diagnostic_collecting') }}
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
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ key }}</p>
              <pre class="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 overflow-x-auto whitespace-pre-wrap text-gray-700 dark:text-gray-300">{{ value || t('raid.page.diagnostic_empty') }}</pre>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Modal: Missing perccli installer -->
    <div
      v-if="missingPerccliOpen"
      class="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 overflow-y-auto p-4"
      @click.self="missingPerccliOpen = false"
    >
      <div class="mt-8 mb-8 w-full max-w-2xl">
        <MissingPerccliWizard
          :san-id="sanId"
          :read-only="isReadOnly"
          @close="missingPerccliOpen = false"
          @completed="() => { missingPerccliOpen = false; manualRefreshRaid() }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CreateMdArrayWizardConfirmPayload, MdAddMemberIntent, MdArray, MdMemberDevice, HardwareRaidController, HardwareRaidLogicalDrive, RaidPreflightResult, StoppedMdArray, ZeroMdSuperblockPartitionResult } from '~/types/raid'
import type { SanSummary } from '~/server/db/repositories/san.repository'
import {
  advancedCleanupMembersForArray,
  extractFetchError,
  getZeroCleanupErrorResults,
  isModalDismiss,
  isValidMdArrayName,
  hasRemainingNonMdSignatures,
  isMdMetadataCleanupSuccessful,
  isRaidCleanupFailureResult,
  membersStillInStoppedArrays,
  stoppedArrayKey,
  stoppedMemberPaths,
  suggestDefaultMdName,
} from '~/utils/stopped-md'
import { translateRaidI18n } from '~/utils/raid-i18n'
import {
  allMdDetectionItems,
  hasAnyMdStateVisible,
  mdDetectionPathSet,
} from '~/utils/raid-md-detection'
import { hasActiveMdArrayProgress } from '~/utils/raid-md-progress'
import { buildRaidSoftwareCockpitViewModel } from '~/utils/raid-software-cockpit-view-model'
import {
  partitionStoppedMdArrays,
} from '~/utils/stopped-md'
import type { MdDetectionItem, RaidActionableItem } from '~/types/raid'
import type { ClusterMdPreflightAction, PreflightBlockerRef, RaidRiskLevel } from '~/types/raid'
import { raidDetectionNavigateKey } from '~/composables/useRaidDetectionNavigate'
import { buildLvmRaidSummary } from '~/utils/lvm-overview-summary'
import type { ClusterAttentionResponse } from '~/types/cluster-admin'
import {
  buildClusterRaidAlertCard,
  buildPerSanRaidPageHealth,
  clusterAttentionPointsForOverview,
} from '~/utils/cluster-raid-page-health'
import { clusterStorageQuery, isClusterStorageScope } from '~/utils/cluster-storage-navigation'
import MissingPerccliWizard from '~/components/raid/MissingPerccliWizard.vue'
import { collectPendingHwRaidBackends } from '~/utils/hw-raid-pending-backend'

definePageMeta({ layout: 'default', ssr: false })

const route = useRoute()
const sanId = route.params.id as string

const { data: san } = await useFetch<SanSummary>(`/api/admin/sans/${sanId}`)

const isReadOnly = computed(() => san.value?.readOnly ?? false)
const isClusteredSan = computed(() => Boolean(san.value?.clusterId))

const missingPerccliOpen = ref(false)
function openMissingPerccliWizard() {
  missingPerccliOpen.value = true
}

const advancedStorageLink = computed(() => {
  const fromRoute = isClusterStorageScope(route.query as Record<string, unknown>)
  const clusterId = fromRoute?.clusterId ?? san.value?.clusterId
  return {
    path: `/admin/sans/${sanId}/advanced-storage`,
    query: clusterId ? clusterStorageQuery(clusterId) : {},
  }
})

const clusterAttention = ref<ClusterAttentionResponse | null>(null)

async function fetchClusterAttention() {
  const clusterId = san.value?.clusterId
  if (!clusterId) {
    clusterAttention.value = null
    return
  }
  try {
    clusterAttention.value = await $fetch<ClusterAttentionResponse>(
      '/api/cluster/attention',
      { query: { clusterId, includeMd: 'true' } },
    )
  } catch {
    clusterAttention.value = null
  }
}

const raid = useRaidStore()
const lvm = useLvmStore()
const { requestLvWizardPrefill } = useLvWizardPrefill()
const { t, tRaidAlert } = useEsosI18n()
const toast = useAppToast()

const tabs = computed(() => [
  { key: 'overview', label: t('raid.page.tab.overview'), icon: 'i-heroicons-chart-bar' },
  { key: 'hardware', label: t('raid.page.tab.hardware'), icon: 'i-heroicons-cpu-chip' },
  { key: 'software', label: t('raid.page.tab.software'), icon: 'i-heroicons-server-stack' },
  { key: 'lvm', label: t('lvm.tab.title'), icon: 'i-heroicons-square-3-stack-3d' },
  { key: 'fs', label: t('storage.fs.tab.title'), icon: 'i-heroicons-folder' },
  { key: 'devices', label: t('raid.page.tab.devices'), icon: 'i-heroicons-circle-stack' },
  { key: 'ops', label: t('raid.page.tab.ops'), icon: 'i-heroicons-queue-list' },
])
const activeTab = ref('overview')
const highlightedArrayPath = ref<string | null>(null)
const highlightedDevicePath = ref<string | null>(null)

const showSoftwareEmpty = computed(() => !hasAnyMdStateVisible(raid.overview))
const partitionedStopped = computed(() => partitionStoppedMdArrays(raid.stoppedMdArrays))
const mdBlockerItems = computed(() => allMdDetectionItems(raid.overview))

const softwareCockpit = computed(() =>
  buildRaidSoftwareCockpitViewModel({
    overview: raid.overview,
    currentSanId: sanId,
    isClustered: isClusteredSan.value,
    stoppedAssemblable: partitionedStopped.value.assemblable,
    stoppedOrphan: partitionedStopped.value.orphanOrIncomplete,
    showEmptyMdState: showSoftwareEmpty.value,
    clusterAttention: isClusteredSan.value ? clusterAttention.value : null,
    t: (key, params) => t(key, params ?? {}),
  }),
)

const perSanHealth = computed(() =>
  buildPerSanRaidPageHealth({
    localRaidHealth: raid.globalHealth,
    cockpit: softwareCockpit.value.status,
    clusterAttention: clusterAttention.value,
    isClustered: isClusteredSan.value,
  }),
)

const pageRaidHealth = computed(() => perSanHealth.value.pageHealth)

const clusterAlertCard = computed(() =>
  buildClusterRaidAlertCard(clusterAttention.value, sanId),
)

const clusterOverviewAlerts = computed(() =>
  clusterAttentionPointsForOverview(clusterAttention.value),
)

const lvmClusterStorageHint = computed(() => {
  if (!isClusteredSan.value || !perSanHealth.value.isClusterCritical) return ''
  return t('raid.overview.lvm_cluster_storage_critical') as string
})

function advancedCleanupMembersForStopped(paths: string[]) {
  return advancedCleanupMembersForArray(paths, raid.pendingAdvancedCleanup)
}

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

function navigateRaidDetection(ref: PreflightBlockerRef) {
  const targetSan = ref.sanId && ref.sanId !== sanId ? ref.sanId : null
  if (targetSan) {
    navigateTo(`/admin/sans/${targetSan}/raid`)
    return
  }
  if (ref.uiAnchor === 'devices' || ref.code === 'md_superblock_on_partition') {
    activeTab.value = 'devices'
    if (ref.path) {
      highlightedDevicePath.value = ref.path
      deviceFilter.value = ref.path.replace(/^\/dev\//, '')
    }
    return
  }
  activeTab.value = 'software'
  if (ref.path) {
    highlightedArrayPath.value = ref.path.startsWith('/dev/md') ? ref.path : null
    if (highlightedArrayPath.value) void scrollToHighlightedArray(highlightedArrayPath.value)
  }
}

function navigateMdDetectionItem(item: MdDetectionItem) {
  navigateRaidDetection({
    code: 'md_superblock_on_partition',
    message: item.summary,
    path: item.path,
    sanId: item.nodeSanId,
    uiAnchor: item.uiAnchor,
  })
}

function onCockpitAction(item: RaidActionableItem) {
  const target = item.primaryActionTarget
  if (!target) return
  if (target.type === 'navigate' && target.sanId && target.sanId !== sanId) {
    void navigateTo(`/admin/sans/${target.sanId}/raid`)
    return
  }
  if (target.type === 'devices' && target.path) {
    goToDevicesForPath(target.path)
    return
  }
  if (target.tab === 'software') activeTab.value = 'software'
  void nextTick(() => {
    if (target.anchor) {
      document.getElementById(target.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    if (target.path?.startsWith('/dev/md')) {
      highlightedArrayPath.value = target.path
      void scrollToHighlightedArray(target.path)
    } else if (target.path) {
      navigateMdDetectionItem({
        kind: 'partition_metadata',
        path: target.path,
        nodeSanId: target.sanId ?? sanId,
        nodeLabel: '',
        severity: 'blocking',
        summary: '',
        reasons: [],
        uiAnchor: 'devices',
      })
    }
  })
}

provide(raidDetectionNavigateKey, navigateRaidDetection)

async function openClusterMdActionModal(input: {
  action: ClusterMdPreflightAction
  title: string
  description: string
  riskLevel: RaidRiskLevel
  payload: Record<string, unknown>
  localPreflight: RaidPreflightResult | null
  confirmationPhrase: string
  arrayName?: string
}): Promise<boolean> {
  if (!isClusteredSan.value || !san.value?.clusterId) return false
  const { default: ClusterModal } = await import('~/components/raid/ClusterMdActionModal.vue')
  try {
    await openModal({
      component: ClusterModal,
      props: {
        ...input,
        sourceSanId: sanId,
        clusterId: san.value.clusterId,
        persistent: true,
      },
    })
    await raid.fetchOverview(true)
    return true
  } catch {
    return false
  }
}

function goToDevicesForPath(path: string) {
  activeTab.value = 'devices'
  highlightedDevicePath.value = path
  deviceFilter.value = path.replace(/^\/dev\//, '')
}

function onFsNavigateBlockDevices(path?: string) {
  if (path) goToDevicesForPath(path)
  else activeTab.value = 'devices'
}

function onFsCreateFileioLv(payload: { lvName: string; vgName?: string }) {
  requestLvWizardPrefill({ lvName: payload.lvName, vgName: payload.vgName })
  activeTab.value = 'lvm'
}

function peerRaidLink(peerSanId: string): string {
  return `/admin/sans/${peerSanId}/raid`
}

function isMdCreateConfirmPayload(value: unknown): value is CreateMdArrayWizardConfirmPayload {
  return typeof value === 'object'
    && value !== null
    && 'action' in value
    && 'arrayPath' in value
    && ((value as CreateMdArrayWizardConfirmPayload).action === 'view-array'
      || (value as CreateMdArrayWizardConfirmPayload).action === 'close')
}

async function openAddMdMemberWizard(arr: MdArray, intent: MdAddMemberIntent) {
  if (!raid.overview) return
  const { default: Wizard } = await import('~/components/raid/AddMdMemberWizard.vue')
  try {
    await openModal({
      component: Wizard,
      props: {
        array: arr,
        intent,
        blockDevices: raid.blockDevices,
        sourceSanId: sanId,
        clusterId: san.value?.clusterId ?? null,
        onNavigateDetection: navigateMdDetectionItem,
        persistent: true,
      },
    })
  } catch { /* dismissed */ }
}

async function openMdWizard() {
  highlightedArrayPath.value = null
  const { default: Wizard } = await import('~/components/raid/CreateMdArrayWizard.vue')
  try {
    const result = await openModal({
      component: Wizard,
      props: {
        blockDevices: raid.blockDevices,
        sourceSanId: sanId,
        clusterId: san.value?.clusterId,
        persistent: true,
        onNavigateDetection: navigateRaidDetection,
      },
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
    const continueToMd = await openModal({
      component: Wizard,
      props: {
        blockDevices: raid.blockDevices,
        sourceSanId: sanId,
        clusterId: san.value?.clusterId,
        persistent: true,
        onNavigateDetection: navigateRaidDetection,
      },
    })
    await raid.fetchOverview(true)
    if (continueToMd) await openMdWizard()
  } catch { /* annulé */ }
}

async function openHwWizard(ctrl?: HardwareRaidController) {
  const { default: Wizard } = await import('~/components/raid/CreateHardwareRaidWizard.vue')
  try {
    const result = await openModal({
      component: Wizard,
      props: {
        controllers: raid.controllers,
        initialControllerId: ctrl?.id,
        sanReadOnly: isReadOnly.value,
        persistent: true,
      },
    })
    if (!result || typeof result !== 'object') return
    await Promise.all([
      raid.fetchOverview(true),
      lvm.fetchOverview(true),
    ])
    const fs = useFsStore()
    fs.setSanId(sanId)
    await fs.fetchOverview(true).catch(() => undefined)
    if (!result.ok) return
    const path = result.osDevicePath
    if (result.navigateTo === 'lvm') {
      activeTab.value = 'lvm'
    } else if (result.navigateTo === 'fs') {
      activeTab.value = 'fs'
    } else if (result.navigateTo === 'devices') {
      if (path) goToDevicesForPath(path)
      else activeTab.value = 'devices'
    }
  } catch { /* annulé */ }
}

// Block device filter
const deviceFilter = ref('')
const showOnlyEligible = ref(false)
const showMdMetadataOnly = ref(false)

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
  if (showMdMetadataOnly.value) {
    const mdPaths = mdDetectionPathSet(raid.overview)
    list = list.filter(d => mdPaths.has(d.path) || d.hasMdSuperblock || d.usedBy.includes('md'))
  }
  if (showOnlyEligible.value) {
    list = list.filter(d =>
      d.eligibleForMd
      || d.eligibleForHardwareRaid
      || d.usedBy.includes('hardware_raid'),
    )
  }
  return list
})

const hasHardwareRaidBlockDevices = computed(() =>
  raid.blockDevices.some(d => d.usedBy.includes('hardware_raid')),
)
const pendingHwBackends = computed(() =>
  collectPendingHwRaidBackends(raid.controllers, raid.tools),
)

const diagnosticSections = computed(() => {
  if (!diagnosticData.value) return {}
  const d = diagnosticData.value
  return {
    [t('raid.page.diagnostic_section.ctrl_mode')]: d.ctrlMode,
    [t('raid.page.diagnostic_section.lspci')]: d.lspci,
    [t('raid.page.diagnostic_section.lsmod')]: d.lsmod,
    [t('raid.page.diagnostic_section.dmesg')]: d.dmesg,
    [t('raid.page.diagnostic_section.lsscsi')]: d.lsscsi,
    [t('raid.page.diagnostic_section.which_cli')]: d.whichCli,
    [t('raid.page.diagnostic_section.direct_paths')]: d.directPaths,
  }
})

// Labels pour affichage mode contrôleur parsé
const ctrlModeLabel = computed(() => {
  const m = diagnosticCtrl.value?.controllerMode?.mode
  if (!m) return null
  const modeKey: Record<string, string> = {
    raid: 'raid.page.ctrl_mode.raid',
    hba: 'raid.page.ctrl_mode.hba',
    mixed: 'raid.page.ctrl_mode.mixed',
    unknown: 'raid.page.ctrl_mode.unknown',
  }
  return t(modeKey[m] ?? modeKey.unknown)
})

const ctrlModeColor = computed(() => {
  const m = diagnosticCtrl.value?.controllerMode?.mode
  if (!m) return 'gray'
  return { raid: 'blue', hba: 'amber', mixed: 'purple', unknown: 'gray' }[m] ?? 'gray'
})

const ctrlConfidenceLabel = computed(() => {
  const c = diagnosticCtrl.value?.controllerMode?.confidence
  if (!c) return null
  return t(`raid.page.ctrl_confidence.${c}`)
})

function raidErr(err: unknown): string {
  return translateRaidI18n(extractFetchError(err), t)
}

// Stopped MD inspect / assemble / zero
const stoppedInspectOpen = ref(false)
const stoppedInspectText = ref('')
const stoppedInspectLabel = ref('')
const stoppedMdActionKey = ref<string | null>(null)

function arrayNeedsAdvancedCleanup(arr: StoppedMdArray): boolean {
  return advancedCleanupMembersForArray(
    stoppedMemberPaths(arr),
    raid.pendingAdvancedCleanup,
  ).length > 0
}

function applyFailedBasicCleanupResults(results: ZeroMdSuperblockPartitionResult[]) {
  const raidFailures = results.filter(r =>
    isRaidCleanupFailureResult(r)
    || r.diagnostics?.recommendedAction === 'advanced_wipe_signatures',
  )
  if (!raidFailures.length) return
  raid.recordCleanupResults(results)
  raid.setPendingAdvancedCleanup(raidFailures)
}

async function finalizeMdCleanupSuccess(
  members: string[],
  result: { results: ZeroMdSuperblockPartitionResult[] },
  successToastKey: 'raid.stopped_md.toast_zero_ok' | 'raid.stopped_md.toast_advanced_cleanup_ok',
) {
  await raid.fetchOverview(true)
  const stillVisible = membersStillInStoppedArrays(members, raid.stoppedMdArrays)
  if (stillVisible.length) {
    toast.warning(t('raid.stopped_md.toast_zero_still_visible', { partitions: stillVisible.join(', ') }))
    return
  }
  raid.clearPendingAdvancedCleanup(members)
  const nonMd = hasRemainingNonMdSignatures(result)
  if (nonMd.length) {
    toast.success(t('raid.stopped_md.toast_md_removed_non_md_signature', { types: nonMd.join(', ') }))
  } else {
    toast.success(t(successToastKey, { partitions: members.join(', ') }))
  }
}

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
      toast.error(t('raid.stopped_md.toast_action_failed'), raidErr(err))
      return
    }

    if (isClusteredSan.value && preflight?.ok) {
      const isOrphan = arr.name === 'unknown' || arr.members.some(m => m.memberStatus === 'orphan_metadata')
      const done = await openClusterMdActionModal({
        action: 'zero_md_superblocks',
        title: isOrphan ? t('raid.stopped_md.zero_orphan_title') : t('raid.stopped_md.zero_title'),
        description: buildZeroSuperblockDescription(arr, members),
        riskLevel: 'destructive',
        payload: zeroSuperblockPreflightPayload(arr, members),
        localPreflight: preflight,
        confirmationPhrase: preflight.requiredConfirmation ?? confirmPhrase,
      })
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
      const apiPayload: { members: string[]; confirmation: string; mode: 'basic'; uuid?: string; name?: string } = {
        members,
        confirmation: confirmation as string,
        mode: 'basic',
      }
      if (arr.uuid) apiPayload.uuid = arr.uuid
      if (isValidMdArrayName(arr.name)) apiPayload.name = arr.name

      console.info('[raid-ui:zero-superblock]', { sanId, members, arrayKey: key, payload: apiPayload })
      const result = await raid.zeroMdSuperblocks(apiPayload)
      console.info('[raid-ui:zero-superblock]', { result })

      if (!isMdMetadataCleanupSuccessful(result)) {
        applyFailedBasicCleanupResults(result.results)
        toast.warning(t('raid.stopped_md.toast_advanced_cleanup_available'))
        const failed = result.results.find(r => isRaidCleanupFailureResult(r))
        if (failed?.diagnostics?.recommendedAction === 'advanced_wipe_signatures') {
          await showZeroCleanupDiagnosticsModal(result.results.filter(r => isRaidCleanupFailureResult(r) || r.diagnostics?.recommendedAction === 'advanced_wipe_signatures'))
        } else if (failed?.verifiedRemoved === false) {
          toast.error(
            t('raid.stopped_md.toast_zero_not_verified', { partition: failed.partition }),
            failed.stdout?.slice(-200),
          )
        } else if (result.warnings.length) {
          toast.warning(t('raid.stopped_md.toast_zero_partial'), result.warnings.join(' · '))
        } else {
          toast.warning(t('raid.stopped_md.toast_action_failed'), t('raid.stopped_md.verification_incomplete'))
        }
        return
      }

      await finalizeMdCleanupSuccess(members, result, 'raid.stopped_md.toast_zero_ok')
    } catch (err: unknown) {
      if (isModalDismiss(err)) return
      const errorResults = getZeroCleanupErrorResults(err)
      if (errorResults.length && errorResults.some(r => r.diagnostics?.recommendedAction === 'advanced_wipe_signatures' || isRaidCleanupFailureResult(r))) {
        applyFailedBasicCleanupResults(errorResults)
        toast.warning(t('raid.stopped_md.toast_advanced_cleanup_available'), raidErr(err))
        if (errorResults.some(r => r.diagnostics?.recommendedAction === 'advanced_wipe_signatures')) {
          await showZeroCleanupDiagnosticsModal(errorResults)
        }
        await raid.fetchOverview(true)
        return
      }
      toast.error(t('raid.stopped_md.toast_action_failed'), raidErr(err))
    }
  } finally {
    stoppedMdActionKey.value = null
  }
}

async function handleAdvancedCleanupStoppedMd(arr: StoppedMdArray) {
  const members = advancedCleanupMembersForArray(
    stoppedMemberPaths(arr),
    raid.pendingAdvancedCleanup,
  )
  const diagnosticsResults: ZeroMdSuperblockPartitionResult[] = members.map((p) => {
    const pending = raid.pendingAdvancedCleanup[p]
    const last = raid.lastCleanupResultsByPartition[p]
    if (last) return last
    return {
      partition: p,
      command: '',
      success: false,
      stdout: '',
      stderr: '',
      exitCode: -1,
      verifiedRemoved: false,
      diagnostics: pending,
    }
  })
  if (!diagnosticsResults.length) {
    toast.warning(t('raid.stopped_md.toast_action_failed'), t('raid.stopped_md.wipe_no_pending'))
    return
  }
  const key = stoppedArrayKey(arr)
  stoppedMdActionKey.value = key
  try {
    await handleWipeMdSignatures(diagnosticsResults)
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
  const detectionSourcesByMember = Object.fromEntries(
    diagnosticsResults
      .filter(r => r.diagnostics?.detectionSources)
      .map(r => [r.partition, r.diagnostics!.detectionSources]),
  )

  let preflight: RaidPreflightResult | null = null
  try {
    preflight = await raid.preflight({
      backend: 'software_md',
      action: 'wipe_md_signatures',
      payload: { mode: 'advanced', members, remainingSignatureTypes, detectionSourcesByMember },
    })
    if (!preflight.ok) {
      toast.warning(t('raid.stopped_md.toast_preflight_blocked'), preflight.blockers[0])
      return
    }
  } catch (err: unknown) {
    toast.error(t('raid.stopped_md.toast_action_failed'), raidErr(err))
    return
  }

    const confirmPhrase = preflight.requiredConfirmation || t('raid.stopped_md.advanced_cleanup_confirm_phrase')
  if (isClusteredSan.value && preflight.ok) {
    const done = await openClusterMdActionModal({
      action: 'wipe_md_signatures',
      title: t('raid.stopped_md.advanced_cleanup'),
      description: t('raid.stopped_md.advanced_cleanup_help'),
      riskLevel: 'destructive',
      payload: { mode: 'advanced', members, remainingSignatureTypes, detectionSourcesByMember },
      localPreflight: preflight,
      confirmationPhrase: confirmPhrase,
    })
    return
  }

  const { default: Modal } = await import('~/components/raid/RaidDestructiveConfirmModal.vue')
  try {
    const confirmation = await openModal({
      component: Modal,
      props: {
        title: t('raid.stopped_md.advanced_cleanup'),
        description: [
          t('raid.stopped_md.advanced_cleanup_help'),
          '',
          `${t('raid.stopped_md.zero_partitions_label')} : ${members.join(', ')}`,
        ].join('\n'),
        riskLevel: 'destructive',
        confirmationPhrase: preflight?.requiredConfirmation ?? confirmPhrase,
        preflight,
        persistent: true,
      },
    })

    console.info('[raid-ui:advanced-cleanup]', { sanId, members, mode: 'advanced' })
    const result = await raid.wipeMdSignatures({
      mode: 'advanced',
      members,
      confirmation: confirmation as string,
      remainingSignatureTypes,
      detectionSourcesByMember,
    })

    if (!isMdMetadataCleanupSuccessful(result)) {
      applyFailedBasicCleanupResults(result.results)
      const failed = result.results.find(r => isRaidCleanupFailureResult(r))
      if (failed?.diagnostics?.recommendedAction === 'advanced_wipe_signatures') {
        await showZeroCleanupDiagnosticsModal(result.results.filter(r =>
          isRaidCleanupFailureResult(r) || r.diagnostics?.recommendedAction === 'advanced_wipe_signatures',
        ))
      } else {
        toast.warning(t('raid.stopped_md.toast_zero_partial'), result.warnings.join(' · '))
      }
      return
    }

    await finalizeMdCleanupSuccess(members, result, 'raid.stopped_md.toast_advanced_cleanup_ok')
  } catch (err: unknown) {
    if (isModalDismiss(err)) return
    const errorResults = getZeroCleanupErrorResults(err)
    if (errorResults.length && errorResults.some(r => r.diagnostics?.recommendedAction === 'advanced_wipe_signatures' || isRaidCleanupFailureResult(r))) {
      applyFailedBasicCleanupResults(errorResults)
      toast.warning(t('raid.stopped_md.toast_advanced_cleanup_available'), raidErr(err))
      if (errorResults.some(r => r.diagnostics?.recommendedAction === 'advanced_wipe_signatures')) {
        await showZeroCleanupDiagnosticsModal(errorResults)
      }
      await raid.fetchOverview(true)
      return
    }
    toast.error(t('raid.stopped_md.toast_action_failed'), raidErr(err))
  }
}

function handleInspectStoppedMd(arr: StoppedMdArray) {
  stoppedInspectLabel.value = arr.path ?? `/dev/${arr.name}`
  const chunks = arr.members
    .map(m => m.mdExamine?.raw?.trim())
    .filter((raw): raw is string => Boolean(raw))
  stoppedInspectText.value = chunks.length
    ? chunks.join('\n\n---\n\n')
    : arr.members.map(m => t('raid.stopped_md.inspect_member_no_examine', { path: m.path })).join('\n\n')
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
      toast.error(t('raid.stopped_md.toast_action_failed'), raidErr(err))
      return
    }

    if (isClusteredSan.value && preflight?.ok) {
      const done = await openClusterMdActionModal({
        action: 'assemble_md',
        title: t('raid.stopped_md.assemble_title'),
        description: t('raid.stopped_md.assemble_description', { path }),
        riskLevel: 'risky',
        payload: { name: arr.name, uuid: arr.uuid, members, targetName },
        localPreflight: preflight,
        confirmationPhrase: phrase,
      })
      if (done) {
        toast.success(t('raid.stopped_md.toast_assemble_ok', { path }))
        activeTab.value = 'software'
        highlightedArrayPath.value = path
        await scrollToHighlightedArray(path)
      }
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
      toast.error(t('raid.stopped_md.toast_action_failed'), raidErr(err))
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
    if (!preflight.ok) {
      toast.warning(t('raid.stopped_md.toast_preflight_blocked'), preflight.blockers[0])
      return
    }
  } catch (err: unknown) {
    toast.error(t('raid.stopped_md.toast_action_failed'), raidErr(err))
    return
  }

  if (isClusteredSan.value) {
    const done = await openClusterMdActionModal({
      action: 'stop_md',
      title: t('raid.cluster_md.stop_title'),
      description: t('raid.cluster_md.stop_description', { name: arr.name }),
      riskLevel: 'risky',
      payload: { name: arr.name },
      localPreflight: preflight,
      confirmationPhrase: phrase,
      arrayName: arr.name,
    })
    if (done) toast.success(t('raid.cluster_md.toast_stop_ok', { name: arr.name }))
    return
  }

  const { default: Modal } = await import('~/components/raid/RaidDestructiveConfirmModal.vue')
  try {
    const confirmation = await openModal({
      component: Modal,
      props: {
        title: t('raid.cluster_md.stop_title'),
        description: t('raid.cluster_md.stop_description', { name: arr.name }),
        riskLevel: 'risky',
        confirmationPhrase: phrase || undefined,
        preflight,
        persistent: true,
      },
    })
    await raid.stopMdArray(arr.name, confirmation as string)
    toast.success(t('raid.cluster_md.toast_stop_ok', { name: arr.name }))
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
  if (!phrase) phrase = `DELETE LD ${ld.id}`
  const { default: Modal } = await import('~/components/raid/RaidDestructiveConfirmModal.vue')
  try {
    const confirmation = await openModal({
      component: Modal,
      props: {
        title: t('raid.page.delete_hw_ld_title'),
        description: t('raid.page.delete_hw_ld_description', { id: ld.id }),
        riskLevel: 'destructive',
        confirmationPhrase: phrase || undefined,
        preflight,
        persistent: true,
      },
    })
    await raid.deleteHardwareLogicalDrive(ld.id, confirmation as string)
  } catch { /* annulé */ }
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
  raid.controllers.some(c => c.supportsCreate && c.managementMode === 'full'),
)

const lvmRaidSummary = computed(() =>
  buildLvmRaidSummary(
    lvm.overview,
    lvm.error,
    lvm.clusterPeers,
    isClusteredSan.value,
  ),
)

const lvmSummaryBadgeColor = computed(() => {
  const s = lvmRaidSummary.value.status
  if (s === 'ok') return 'green'
  if (s === 'unavailable') return 'gray'
  if (s === 'empty' || s === 'incomplete') return 'amber'
  return 'amber'
})

function openLvmFromRaidSummary() {
  activeTab.value = 'lvm'
}

async function manualRefreshRaid() {
  await Promise.all([
    raid.fetchOverview(true),
    lvm.fetchOverview(true),
    fetchClusterAttention(),
  ])
  await raid.fetchOperations()
}

function bindRaidPage(sanIdValue: string) {
  raid.teardownRaidPage()
  raid.sanId = sanIdValue
  raid.hydratePendingAdvancedCleanup()
  lvm.setSanId(sanIdValue)
  void raid.initRaidPage()
  void lvm.fetchOverview()
}

watch(
  () => route.params.id as string,
  (nextId, prevId) => {
    if (!nextId || nextId === prevId) return
    bindRaidPage(nextId)
  },
)

watch(
  () => raid.progressPollWarning,
  (msg) => {
    if (!msg) return
    toast.warning(t('raid.progress.auto_refresh_failed'), msg)
    raid.clearProgressPollWarning()
  },
)

function onVisibilityChange() {
  if (typeof document === 'undefined') return
  if (document.hidden) {
    raid.pauseProgressPolling()
  } else {
    raid.resumeProgressPolling()
  }
}

onMounted(() => {
  bindRaidPage(sanId)
  void fetchClusterAttention()
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
})

watch(
  () => san.value?.clusterId,
  () => { void fetchClusterAttention() },
)

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
  raid.teardownRaidPage()
})
</script>
