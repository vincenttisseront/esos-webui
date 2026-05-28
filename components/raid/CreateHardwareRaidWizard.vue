<template>
  <div class="bg-white dark:bg-gray-900 rounded-xl shadow-modal w-full relative max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden outline-none" role="dialog" :aria-modal="true">
    <div class="px-5 pt-5 pb-0 shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-purple-500" />
          <h3 class="font-semibold text-gray-900 dark:text-gray-100">
            {{ t('raid.hw_create_wizard.title_step', { step: step + 1, total: steps.length }) }}
          </h3>
        </div>
      </div>
      <div class="flex gap-1 mt-3">
        <div
          v-for="(s, i) in steps"
          :key="i"
          class="h-1 flex-1 rounded-full transition-colors"
          :class="i <= step ? 'bg-purple-500' : 'bg-gray-200'"
        />
      </div>
    </div>

    <div class="px-5 py-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">

      <!-- Étape 0 : Sélection contrôleur -->
      <div v-if="step === 0" class="space-y-3">
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('raid.hw_create_wizard.controller_intro') }}</p>

        <div
          v-if="!eligibleEntries.length"
          class="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 space-y-3"
        >
          <p class="text-sm font-medium text-amber-800 dark:text-amber-200">{{ t('raid.hw_create_wizard.no_eligible_title') }}</p>
          <ul class="text-sm text-amber-700 dark:text-amber-300 space-y-2 list-none">
            <li v-for="entry in allEntries" :key="entry.controller.id" class="border-t border-amber-200/60 dark:border-amber-500/20 pt-2 first:border-0 first:pt-0">
              <span class="font-medium">{{ entry.controller.model }}</span>
              <span class="text-xs text-amber-600 dark:text-amber-400 ml-1">({{ entry.controller.id }})</span>
              <ul class="mt-1 text-xs list-disc list-inside">
                <li v-for="msg in entry.reasonMessages" :key="msg">{{ msg }}</li>
              </ul>
            </li>
          </ul>
        </div>

        <div v-else class="space-y-2" role="radiogroup" :aria-label="t('raid.hw_create_wizard.controller_label')">
          <button
            v-for="entry in eligibleEntries"
            :key="entry.controller.id"
            type="button"
            class="w-full text-left rounded-lg border px-4 py-3 transition-colors"
            :class="form.controllerId === entry.controller.id
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10 ring-1 ring-purple-500'
              : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'"
            @click="selectController(entry.controller.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="font-medium text-gray-900 dark:text-gray-100">{{ entry.controller.model }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {{ t('raid.hw_create_wizard.controller_id', { id: entry.controller.id }) }}
                </p>
              </div>
              <UIcon
                v-if="form.controllerId === entry.controller.id"
                name="i-heroicons-check-circle"
                class="w-5 h-5 text-purple-500 shrink-0"
              />
            </div>
            <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
              <div>
                <dt class="inline">{{ t('raid.hw_create_wizard.field_mode') }}:</dt>
                <dd class="inline ml-1">{{ modeLabel(entry.controller) }}</dd>
              </div>
              <div>
                <dt class="inline">{{ t('raid.hw_create_wizard.field_cli') }}:</dt>
                <dd class="inline ml-1 font-mono">{{ entry.controller.cliPath ?? entry.controller.cliTool }}</dd>
              </div>
              <div>
                <dt class="inline">{{ t('raid.hw_create_wizard.field_pd') }}:</dt>
                <dd class="inline ml-1">{{ entry.eligibility.physicalDiskCount }}</dd>
              </div>
              <div>
                <dt class="inline">{{ t('raid.hw_create_wizard.field_free') }}:</dt>
                <dd class="inline ml-1 text-green-700 dark:text-green-400">{{ entry.eligibility.freeDiskCount }}</dd>
              </div>
              <div>
                <dt class="inline">{{ t('raid.hw_create_wizard.field_vd') }}:</dt>
                <dd class="inline ml-1">{{ entry.eligibility.logicalDriveCount }}</dd>
              </div>
            </dl>
          </button>
        </div>

        <div v-if="selectedController && form.controllerId" class="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 rounded px-3 py-2 space-y-1">
          <p>{{ t('raid.hw_create_wizard.available_drives', { count: availableDrives.length }) }}</p>
        </div>
      </div>

      <!-- Étape 1 : Niveau RAID -->
      <div v-else-if="step === 1" class="space-y-3">
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('raid.hw_create_wizard.raid_level_intro') }}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ t('raid.hw_create_wizard.free_disks_hint', { count: freeDiskCount }) }}
        </p>
        <div class="space-y-2" role="radiogroup" :aria-label="t('raid.hw_create_wizard.raid_level')">
          <button
            v-for="card in raidLevelCards"
            :key="card.level"
            type="button"
            class="w-full text-left rounded-lg border px-4 py-3 transition-colors"
            :class="raidLevelCardClass(card)"
            :disabled="!card.enabled"
            :aria-pressed="form.raidLevel === card.level"
            @click="selectRaidLevel(card.level)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-medium" :class="card.enabled ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'">
                  {{ card.title }}
                </p>
                <p class="text-xs mt-1" :class="card.enabled ? 'text-gray-600 dark:text-gray-400' : 'text-gray-400'">
                  {{ card.description }}
                </p>
                <p class="text-xs mt-1 font-medium" :class="card.enabled ? 'text-purple-700 dark:text-purple-300' : 'text-gray-400'">
                  {{ card.minLabel }}
                </p>
                <p v-if="!card.enabled && card.disabledReason" class="text-xs mt-1 text-amber-600 dark:text-amber-400">
                  {{ card.disabledReason }}
                </p>
              </div>
              <UIcon
                v-if="form.raidLevel === card.level && card.enabled"
                name="i-heroicons-check-circle"
                class="w-5 h-5 text-purple-500 shrink-0"
              />
            </div>
          </button>
        </div>
      </div>

      <!-- Étape 2 : Sélection disques -->
      <div v-else-if="step === 2" class="space-y-3">
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('raid.hw_create_wizard.select_drives', { min: minDrives }) }}</p>
        <div class="max-h-72 overflow-y-auto space-y-1">
          <label
            v-for="drive in availableDrives"
            :key="driveKey(drive)"
            class="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-50 dark:bg-gray-950 cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="isDriveSelected(drive)"
              class="accent-purple-500"
              @change="toggleDrive(drive)"
            />
            <div class="flex-1">
              <div class="flex items-center gap-2 text-sm">
                <span class="font-mono text-gray-700 dark:text-gray-300">Slot {{ drive.enclosure ? `${drive.enclosure}:` : '' }}{{ drive.slot }}</span>
                <span class="text-gray-500 dark:text-gray-400">{{ formatSize(drive.sizeBytes) }}</span>
                <span class="text-gray-500 dark:text-gray-400 text-xs">{{ drive.mediaType }}</span>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">{{ drive.model }}</div>
            </div>
          </label>
        </div>
        <p v-if="form.drives.length < minDrives" class="text-xs text-amber-600">
          {{ t('raid.hw_create_wizard.drives_selected', { selected: form.drives.length, min: minDrives }) }}
        </p>
      </div>

      <!-- Étape 3 : Politiques cache -->
      <div v-else-if="step === 3" class="space-y-5">
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('raid.hw_create_wizard.read_policy') }}</p>
          <div class="space-y-2" role="radiogroup" :aria-label="t('raid.hw_create_wizard.read_policy')">
            <button
              v-for="card in readPolicyCards"
              :key="card.value"
              type="button"
              class="w-full text-left rounded-lg border px-4 py-3 transition-colors"
              :class="optionCardClass(form.readPolicy === card.value)"
              :aria-pressed="form.readPolicy === card.value"
              @click="form.readPolicy = card.value"
            >
              <p class="font-medium text-gray-900 dark:text-gray-100">{{ card.title }}</p>
              <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{{ card.description }}</p>
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('raid.hw_create_wizard.write_policy') }}</p>
          <div class="space-y-2" role="radiogroup" :aria-label="t('raid.hw_create_wizard.write_policy')">
            <button
              v-for="card in writePolicyCards"
              :key="card.value"
              type="button"
              class="w-full text-left rounded-lg border px-4 py-3 transition-colors"
              :class="optionCardClass(form.writePolicy === card.value)"
              :aria-pressed="form.writePolicy === card.value"
              @click="form.writePolicy = card.value"
            >
              <p class="font-medium text-gray-900 dark:text-gray-100">{{ card.title }}</p>
              <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{{ card.description }}</p>
            </button>
          </div>
          <p class="text-xs text-amber-600 dark:text-amber-400">{{ t('raid.hw_create_wizard.write_policy_hint') }}</p>
        </div>

        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <label
              for="hw-create-vd-name"
              class="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {{ t('raid.hw_create_wizard.volume_name_label') }}
            </label>
            <UBadge color="neutral" variant="subtle" size="xs">
              {{ t('raid.hw_create_wizard.volume_name_optional') }}
            </UBadge>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ t('raid.hw_create_wizard.volume_name_help') }}
          </p>
          <UInput
            id="hw-create-vd-name"
            v-model="form.name"
            :placeholder="t('raid.hw_create_wizard.volume_name_placeholder_example')"
            class="font-mono"
          />
          <p v-if="volumeNameErrorMessage" class="text-xs text-red-600 dark:text-red-400">
            {{ volumeNameErrorMessage }}
          </p>
          <p
            v-else-if="volumeNameUnsupportedHint"
            class="text-xs text-amber-600 dark:text-amber-400"
          >
            {{ volumeNameUnsupportedHint }}
          </p>
        </div>
      </div>

      <!-- Étape 4 : Pré-vérification -->
      <div v-else-if="step === 4" class="space-y-3">
        <div v-if="preflightLoading" class="py-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
          {{ t('raid.hw_create_wizard.preflight_loading') }}
        </div>
        <RaidPreflightPanel v-else-if="preflightResult" :preflight="preflightResult" />
        <UAlert
          v-if="preflightResult && !preflightResult.ok"
          :title="t('raid.hw_create_wizard.preflight_blocked')"
          color="red"
          icon="i-heroicons-x-circle"
        />
      </div>

      <!-- Étape 6 : Résultat -->
      <div v-else-if="step === 6" class="space-y-4">
        <UAlert
          v-if="createResult?.warning"
          color="amber"
          icon="i-heroicons-exclamation-triangle"
          :title="t('raid.hw_create_wizard.result_warning_title')"
          :description="t('raid.hw_create_wizard.result_warning_body')"
        />
        <UAlert
          v-else-if="createResult?.ok"
          color="green"
          icon="i-heroicons-check-circle"
          :title="t('raid.hw_create_wizard.result_success_title')"
        />

        <dl v-if="createResult" class="text-sm space-y-2 text-gray-700 dark:text-gray-300">
          <div v-if="createResult.createdVirtualDriveId">
            <dt class="font-medium text-gray-500 dark:text-gray-400">{{ t('raid.hw_create_wizard.result_vd_id') }}</dt>
            <dd class="font-mono">{{ createResult.createdVirtualDriveId }}</dd>
          </div>
          <div v-if="createResult.ok">
            <dt class="font-medium text-gray-500 dark:text-gray-400">{{ t('raid.hw_create_wizard.result_os_path') }}</dt>
            <dd v-if="postCreateContext?.osPath" class="font-mono">{{ postCreateContext.osPath }}</dd>
            <dd v-else class="text-amber-700 dark:text-amber-300 text-xs">{{ t('raid.hw_create_wizard.result_os_unmapped') }}</dd>
          </div>
          <div>
            <dt class="font-medium text-gray-500 dark:text-gray-400">{{ t('raid.hw_create_wizard.result_command') }}</dt>
            <dd class="font-mono text-xs break-all bg-gray-50 dark:bg-gray-950 rounded p-2 mt-1">{{ createResult.command }}</dd>
          </div>
          <div>
            <dt class="font-medium text-gray-500 dark:text-gray-400">{{ t('raid.hw_create_wizard.result_exit_code') }}</dt>
            <dd>{{ createResult.exitCode }}</dd>
          </div>
          <div v-if="createResult.selectedSlots?.length">
            <dt class="font-medium text-gray-500 dark:text-gray-400">{{ t('raid.hw_create_wizard.result_slots') }}</dt>
            <dd class="font-mono">{{ createResult.selectedSlots.join(', ') }}</dd>
          </div>
          <div v-if="createResult.requestedVolumeName">
            <dt class="font-medium text-gray-500 dark:text-gray-400">{{ t('raid.hw_create_wizard.result_requested_name') }}</dt>
            <dd class="font-mono">{{ createResult.requestedVolumeName }}</dd>
          </div>
          <div v-if="createResult.nameApplyCommand">
            <dt class="font-medium text-gray-500 dark:text-gray-400">{{ t('raid.hw_create_wizard.result_name_command') }}</dt>
            <dd class="font-mono text-xs break-all">{{ createResult.nameApplyCommand }}</dd>
          </div>
        </dl>

        <UAlert
          v-if="createResult?.ok && postCreateContext && !postCreateContext.osPath"
          color="amber"
          variant="soft"
          icon="i-heroicons-exclamation-triangle"
          :title="t('raid.hw_create_wizard.result_os_pending_title')"
          :description="t('raid.hw_create_wizard.result_os_pending_body')"
        >
          <div class="mt-2 flex flex-wrap gap-2">
            <UButton
              size="xs"
              color="amber"
              variant="soft"
              :loading="rescanning"
              @click="rescanForNewBackend"
            >
              {{ t('raid.hw_create_wizard.result_action_rescan_scsi') }}
            </UButton>
            <UButton
              size="xs"
              color="gray"
              variant="ghost"
              @click="finishWizard('devices')"
            >
              {{ t('raid.hw_create_wizard.next_view_devices') }}
            </UButton>
          </div>
          <ul class="list-disc pl-4 text-xs mt-2 space-y-0.5">
            <li>{{ t('raid.hw_create_wizard.result_action_check_lsscsi') }}</li>
            <li>{{ t('raid.hw_create_wizard.result_action_reboot_if_needed') }}</li>
          </ul>
        </UAlert>

        <UAlert
          v-if="createResult?.nameWarning"
          color="amber"
          variant="subtle"
          icon="i-heroicons-information-circle"
          :title="t('raid.hw_create_wizard.result_name_not_applied_title')"
          :description="createResult.nameWarning"
        />

        <div v-if="createResult?.ok && postCreateContext?.osPath" class="rounded-lg border border-blue-100 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-950/40 px-3 py-3 space-y-3">
          <p class="text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wide">{{ t('raid.hw_create_wizard.next_steps_title') }}</p>
          <p class="text-xs text-blue-800 dark:text-blue-200">{{ t('raid.hw_create_wizard.next_steps_body') }}</p>
          <div class="flex flex-wrap gap-2">
            <UButton size="xs" color="primary" variant="soft" icon="i-heroicons-circle-stack" @click="finishWizard('lvm')">
              {{ t('raid.hw_create_wizard.next_open_lvm') }}
            </UButton>
            <UButton size="xs" color="emerald" variant="soft" icon="i-heroicons-folder" @click="finishWizard('fs')">
              {{ t('raid.hw_create_wizard.next_create_fileio') }}
            </UButton>
            <UButton size="xs" color="gray" variant="soft" icon="i-heroicons-server" @click="finishWizard('devices')">
              {{ t('raid.hw_create_wizard.next_view_devices') }}
            </UButton>
          </div>
        </div>

        <UAlert
          v-if="createResult?.ok && postCreateContext && !postCreateContext.eligibility.lvmEligible && !postCreateContext.eligibility.fileioEligible"
          color="amber"
          variant="soft"
          icon="i-heroicons-information-circle"
          :title="t('raid.hw_create_wizard.backend_diagnostics_title')"
        >
          <ul class="list-disc pl-4 text-xs mt-1 space-y-0.5">
            <li v-for="(reason, i) in postCreateContext.eligibility.reasons" :key="i">{{ reason }}</li>
          </ul>
        </UAlert>

        <details v-if="createResult" class="text-xs">
          <summary class="cursor-pointer text-gray-600 dark:text-gray-400">{{ t('raid.hw_create_wizard.result_details') }}</summary>
          <pre class="mt-2 p-2 bg-gray-50 dark:bg-gray-950 rounded overflow-x-auto max-h-48 whitespace-pre-wrap">{{ createResult.stdout }}</pre>
          <pre v-if="createResult.stderr" class="mt-2 p-2 bg-gray-50 dark:bg-gray-950 rounded overflow-x-auto max-h-24 whitespace-pre-wrap">{{ createResult.stderr }}</pre>
          <p v-if="createResult.verificationMessage" class="mt-2 text-amber-600 dark:text-amber-400">{{ createResult.verificationMessage }}</p>
        </details>
      </div>

      <!-- Étape 5 : Confirmation -->
      <div v-else-if="step === 5" class="space-y-4">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-heroicons-exclamation-triangle"
          :title="t('raid.hw_create_wizard.destructive_warning_title')"
          :description="t('raid.hw_create_wizard.destructive_warning_body')"
        />
        <HardwareRaidCommandCompatibilityPanel
          v-if="previewCommand && selectedController"
          :command="previewCommand"
          :raid-level="form.raidLevel"
          :drives="form.drives"
          :cli-tool="selectedController.cliTool"
          :cli-path="selectedController.cliPath ?? selectedController.cliTool"
          :read-policy="form.readPolicy"
          :write-policy="form.writePolicy"
          :volume-name="resolvedVolumeName"
          :volume-name-on-create="supportsHwVdNameOnCreate(selectedController.cliTool as RaidCliCreateFlavor)"
        />
        <RaidPreflightPanel v-if="preflightResult" :preflight="preflightResult" />
        <div v-if="preflightResult?.requiredConfirmation" class="space-y-2">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('raid.hw_create_wizard.confirm_phrase') }}
            <code class="text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded font-mono text-xs">{{ preflightResult.requiredConfirmation }}</code>
          </p>
          <UInput v-model="form.confirmation" class="font-mono" @paste.prevent />
        </div>
        <label class="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" v-model="understood" class="mt-0.5 accent-red-500" />
          <span class="text-sm text-gray-600 dark:text-gray-400">{{ t('raid.hw_create_wizard.understand_risk') }}</span>
        </label>
        <p v-if="submitError" class="text-sm text-red-600">{{ submitError }}</p>
      </div>
    </div>

    <div class="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 flex justify-between">
      <UButton
        color="gray"
        variant="ghost"
        :disabled="busy"
        @click="handleBack"
      >
        {{ step === 6 ? t('raid.hw_create_wizard.result_close') : step === 0 ? t('raid.page.cancel') : t('raid.hw_create_wizard.back') }}
      </UButton>
      <UButton
        v-if="step < 5"
        color="purple"
        :disabled="!canNext || busy"
        @click="handleNext"
      >
        {{ t('raid.hw_create_wizard.next') }}
      </UButton>
      <UButton
        v-else-if="step === 5"
        color="green"
        :disabled="!canSubmit || busy"
        :loading="busy"
        icon="i-heroicons-bolt"
        @click="submit"
      >
        {{ t('raid.hw_create_wizard.create') }}
      </UButton>
      <UButton
        v-else
        color="purple"
        :disabled="busy"
        @click="finishWizard"
      >
        {{ t('raid.hw_create_wizard.result_close') }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  CreateHardwareLogicalDriveResponse,
  HardwareRaidController,
  HardwareRaidPhysicalDrive,
  RaidPreflightResult,
} from '~/types/raid'
import {
  assessHwRaidCreateEligibility,
  type HwRaidCreateIneligibilityReason,
} from '~/utils/raid-hw-create-eligibility'
import {
  buildHwCliCreateLd,
  resolveHwVdNameForCommand,
  supportsHwVdNameOnCreate,
  supportsHwVdNameOption,
  validateHwVdName,
  type RaidCliCreateFlavor,
} from '~/utils/raid-hw-cli-create'
import { resolveHwLdBackendContext } from '~/utils/hw-raid-backend-eligibility'

const props = defineProps<{
  controllers: HardwareRaidController[]
  initialControllerId?: string
  sanReadOnly?: boolean
}>()

const emit = defineEmits<{
  confirm: [result?: CreateHardwareLogicalDriveResponse]
  cancel: []
}>()

const { t } = useI18n()
const toast = useToast()
const raid = useRaidStore()

const steps = computed(() => [
  t('raid.hw_create_wizard.step.controller'),
  t('raid.hw_create_wizard.step.level'),
  t('raid.hw_create_wizard.step.drives'),
  t('raid.hw_create_wizard.step.cache'),
  t('raid.hw_create_wizard.step.preflight'),
  t('raid.hw_create_wizard.step.confirm'),
  t('raid.hw_create_wizard.step.result'),
])

const step = ref(0)
const busy = ref(false)
const understood = ref(false)
const submitError = ref<string | null>(null)
const preflightResult = ref<RaidPreflightResult | null>(null)
const preflightLoading = ref(false)
const createResult = ref<CreateHardwareLogicalDriveResponse | null>(null)
const rescanning = ref(false)

const postCreateContext = computed(() => {
  const r = createResult.value
  if (!r?.ok || !r.createdVirtualDriveId) return null
  if (r.osMappingStatus) {
    return {
      osPath: r.osDevicePath ?? null,
      status: r.backendStatus,
      eligibility: {
        lvmEligible: r.lvmEligible ?? false,
        fileioEligible: r.fileioEligible ?? false,
        reasons: r.backendDiagnostics ?? [],
      },
    }
  }
  const ctx = resolveHwLdBackendContext(raid.controllers, raid.blockDevices, r.createdVirtualDriveId)
  if (!ctx) return null
  return {
    osPath: ctx.osPath,
    status: {
      controllerDetected: true,
      osDeviceDetected: Boolean(ctx.osPath),
      osPath: ctx.osPath ?? undefined,
      pendingRescan: !ctx.osPath,
    },
    eligibility: ctx.eligibility,
  }
})

const HW_RAID_LEVELS = ['1', '5', '6', '10'] as const
type HwRaidLevel = typeof HW_RAID_LEVELS[number]

const form = reactive({
  controllerId: '',
  raidLevel: '1' as HwRaidLevel,
  drives: [] as Array<{ enclosure?: string; slot: string }>,
  readPolicy: 'ADRA' as 'NORA' | 'RA' | 'ADRA',
  writePolicy: 'WT' as 'WT' | 'WB',
  name: '',
  confirmation: '',
  sizeMode: 'max' as const,
})

function reasonMessage(code: HwRaidCreateIneligibilityReason): string {
  return t(`raid.hw_create_wizard.reason.${code}`)
}

const allEntries = computed(() =>
  props.controllers.map(controller => {
    const eligibility = assessHwRaidCreateEligibility(controller, { sanReadOnly: props.sanReadOnly })
    const reasonMessages = eligibility.reasons.map(reasonMessage)
    return { controller, eligibility, reasonMessages }
  }),
)

const eligibleEntries = computed(() =>
  allEntries.value.filter(e => e.eligibility.eligible),
)

const selectedController = computed(() =>
  props.controllers.find(c => c.id === form.controllerId),
)

const availableDrives = computed((): HardwareRaidPhysicalDrive[] =>
  (selectedController.value?.physicalDrives ?? []).filter(d => d.eligible),
)

const freeDiskCount = computed(() => availableDrives.value.length)

const cliCreateFlavor = computed((): RaidCliCreateFlavor | null => {
  const tool = selectedController.value?.cliTool
  if (tool === 'perccli' || tool === 'storcli') return tool
  return null
})

const volumeNameErrorMessage = computed(() => {
  if (!form.name.trim() || !cliCreateFlavor.value) return null
  const result = validateHwVdName(form.name, cliCreateFlavor.value)
  if (result.ok) return null
  if (result.error === 'invalid_chars') {
    return t('raid.hw_create_wizard.volume_name_invalid_chars')
  }
  return t('raid.hw_create_wizard.volume_name_too_long', {
    max: cliCreateFlavor.value === 'perccli' ? 15 : 32,
  })
})

const volumeNameUnsupportedHint = computed(() => {
  if (!form.name.trim()) return null
  if (cliCreateFlavor.value && supportsHwVdNameOption(cliCreateFlavor.value)) return null
  return t('raid.hw_create_wizard.volume_name_unsupported')
})

const resolvedVolumeName = computed(() => {
  if (!cliCreateFlavor.value || volumeNameErrorMessage.value) return undefined
  return resolveHwVdNameForCommand(form.name, cliCreateFlavor.value)
})

const previewCommand = computed(() => {
  const ctrl = selectedController.value
  if (!ctrl || !form.controllerId || !form.drives.length || !form.raidLevel) return null
  const cli = ctrl.cliPath ?? ctrl.cliTool
  if (ctrl.cliTool !== 'perccli' && ctrl.cliTool !== 'storcli') return null
  if (volumeNameErrorMessage.value) return null
  return buildHwCliCreateLd({
    cli,
    ctrlIndex: ctrl.id,
    raidLevel: form.raidLevel,
    drives: form.drives,
    writePolicy: form.writePolicy,
    readPolicy: form.readPolicy,
    flavor: ctrl.cliTool,
    includeCachePolicies: ctrl.cliTool === 'storcli',
    volumeName: ctrl.cliTool === 'storcli' ? resolvedVolumeName.value : undefined,
  })
})

function minDrivesForLevel(level: string): number {
  const map: Record<string, number> = { '1': 2, '5': 3, '6': 4, '10': 4 }
  return map[level] ?? 2
}

const minDrives = computed(() => minDrivesForLevel(form.raidLevel))

const raidLevelCards = computed(() =>
  HW_RAID_LEVELS.map(level => {
    const min = minDrivesForLevel(level)
    const enabled = freeDiskCount.value >= min
    return {
      level,
      minDisks: min,
      enabled,
      title: t(`raid.hw_create_wizard.levels.${level}.title`),
      description: t(`raid.hw_create_wizard.levels.${level}.description`),
      minLabel: t('raid.hw_create_wizard.levels.min_disks', { count: min }),
      disabledReason: enabled
        ? undefined
        : t('raid.hw_create_wizard.levels.unavailable', { available: freeDiskCount.value, min }),
    }
  }),
)

const readPolicyCards = computed(() => ([
  { value: 'NORA' as const, title: t('raid.hw_create_wizard.policy.nora_title'), description: t('raid.hw_create_wizard.policy.nora_desc') },
  { value: 'RA' as const, title: t('raid.hw_create_wizard.policy.ra_title'), description: t('raid.hw_create_wizard.policy.ra_desc') },
  { value: 'ADRA' as const, title: t('raid.hw_create_wizard.policy.adra_title'), description: t('raid.hw_create_wizard.policy.adra_desc') },
]))

const writePolicyCards = computed(() => ([
  { value: 'WT' as const, title: t('raid.hw_create_wizard.policy.wt_title'), description: t('raid.hw_create_wizard.policy.wt_desc') },
  { value: 'WB' as const, title: t('raid.hw_create_wizard.policy.wb_title'), description: t('raid.hw_create_wizard.policy.wb_desc') },
]))

const canNext = computed(() => {
  if (step.value === 0) return !!form.controllerId && eligibleEntries.value.some(e => e.controller.id === form.controllerId)
  if (step.value === 1) {
    const card = raidLevelCards.value.find(c => c.level === form.raidLevel)
    return !!card?.enabled
  }
  if (step.value === 2) return form.drives.length >= minDrives.value
  if (step.value === 3) {
    if (volumeNameErrorMessage.value) return false
    if (form.name.trim() && volumeNameUnsupportedHint.value) return false
    return true
  }
  if (step.value === 4) return !!preflightResult.value?.ok
  return true
})

const canSubmit = computed(() =>
  understood.value
  && preflightResult.value?.ok
  && (!preflightResult.value.requiredConfirmation || form.confirmation.trim() === preflightResult.value.requiredConfirmation),
)

function optionCardClass(selected: boolean): string {
  return selected
    ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10 ring-1 ring-purple-500'
    : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'
}

function raidLevelCardClass(card: { level: string; enabled: boolean }): string {
  if (!card.enabled) {
    return 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 opacity-60 cursor-not-allowed'
  }
  return optionCardClass(form.raidLevel === card.level)
}

function driveKey(drive: HardwareRaidPhysicalDrive): string {
  return `${drive.enclosure ?? '252'}:${drive.slot}`
}

function isDriveSelected(drive: HardwareRaidPhysicalDrive): boolean {
  return form.drives.some(d => driveKey(d) === driveKey(drive))
}

function toggleDrive(drive: HardwareRaidPhysicalDrive) {
  if (!drive.eligible || drive.state !== 'unconfigured_good') return
  const key = driveKey(drive)
  if (isDriveSelected(drive)) {
    form.drives = form.drives.filter(d => driveKey(d) !== key)
  } else {
    form.drives.push({ enclosure: drive.enclosure, slot: drive.slot })
  }
}

function handleBack() {
  if (step.value === 6) {
    finishWizard()
    return
  }
  if (step.value === 0) {
    emit('cancel')
    return
  }
  step.value--
}

function finishWizard(navigateTo?: 'lvm' | 'fs' | 'devices') {
  if (!createResult.value) {
    emit('confirm', undefined)
    return
  }
  emit('confirm', {
    ...createResult.value,
    navigateTo,
    osDevicePath: postCreateContext.value?.osPath ?? createResult.value.osDevicePath,
  })
}

function selectController(id: string) {
  form.controllerId = id
  form.drives = []
  ensureValidRaidLevel()
}

function selectRaidLevel(level: HwRaidLevel) {
  const card = raidLevelCards.value.find(c => c.level === level)
  if (!card?.enabled) return
  form.raidLevel = level
  if (form.drives.length > 0 && form.drives.length < minDrivesForLevel(level)) {
    form.drives = []
  }
}

function ensureValidRaidLevel() {
  const current = raidLevelCards.value.find(c => c.level === form.raidLevel)
  if (current?.enabled) return
  const first = raidLevelCards.value.find(c => c.enabled)
  if (first) form.raidLevel = first.level
}

function modeLabel(ctrl: HardwareRaidController): string {
  const mode = ctrl.controllerMode?.mode
  if (mode === 'raid') return t('raid.page.ctrl_mode.raid')
  if (mode === 'hba') return t('raid.page.ctrl_mode.hba')
  if (mode === 'mixed') return t('raid.page.ctrl_mode.mixed')
  return t('raid.page.ctrl_mode.unknown')
}

onMounted(() => {
  const initial = props.initialControllerId
  if (initial && eligibleEntries.value.some(e => e.controller.id === initial)) {
    form.controllerId = initial
  } else if (eligibleEntries.value.length === 1) {
    form.controllerId = eligibleEntries.value[0].controller.id
  }
  ensureValidRaidLevel()
})

watch(freeDiskCount, () => ensureValidRaidLevel())

async function handleNext() {
  step.value++
  if (step.value === 4) await runPreflight()
}

async function runPreflight() {
  preflightLoading.value = true
  try {
    preflightResult.value = await raid.preflight({
      backend: 'hardware',
      action: 'create_hw_ld',
      payload: { controllerId: form.controllerId, drives: form.drives, raidLevel: form.raidLevel },
    })
    form.confirmation = ''
  } finally {
    preflightLoading.value = false
  }
}

async function submit() {
  if (busy.value) return
  busy.value = true
  submitError.value = null
  createResult.value = null
  try {
    const result = await raid.createHardwareLogicalDrive({
      controllerId: form.controllerId,
      raidLevel: form.raidLevel,
      drives: form.drives,
      name: resolvedVolumeName.value,
      sizeMode: 'max',
      readPolicy: form.readPolicy,
      writePolicy: form.writePolicy,
      confirmation: form.confirmation.trim(),
    })
    createResult.value = result
    step.value = 6
    if (result.nameWarning) {
      toast.add({
        title: t('raid.hw_create_wizard.result_name_not_applied_title'),
        description: result.nameWarning,
        color: 'amber',
        icon: 'i-heroicons-information-circle',
      })
    } else if (result.warning) {
      toast.add({
        title: t('raid.hw_create_wizard.result_warning_title'),
        description: t('raid.hw_create_wizard.result_warning_body'),
        color: 'amber',
        icon: 'i-heroicons-exclamation-triangle',
      })
    } else {
      toast.add({
        title: t('raid.hw_create_wizard.result_success_title'),
        description: result.createdVirtualDriveId
          ? t('raid.hw_create_wizard.result_success_vd', { id: result.createdVirtualDriveId })
          : undefined,
        color: 'green',
        icon: 'i-heroicons-check-circle',
      })
    }
  } catch (err: any) {
    const data = err?.data ?? {}
    let msg = data?.statusMessage ?? err?.statusMessage ?? err.message ?? t('raid.hw_create_wizard.submit_error')
    if (data?.syntaxError && selectedController.value?.cliTool === 'perccli') {
      msg = t('raid.hw_create_wizard.syntax_error_perccli')
      if (data.helpCommand) {
        msg += ` (${data.helpCommand})`
      }
    }
    submitError.value = msg
    toast.add({
      title: t('raid.hw_create_wizard.submit_error'),
      description: msg,
      color: 'red',
      icon: 'i-heroicons-x-circle',
    })
  } finally {
    busy.value = false
  }
}

async function rescanForNewBackend() {
  if (rescanning.value) return
  rescanning.value = true
  try {
    await raid.rescanHardwareScsi()
    await raid.fetchOverview(true)
    toast.add({
      title: t('raid.hw_create_wizard.result_action_rescan_scsi'),
      description: t('raid.hw_create_wizard.result_rescan_done'),
      color: 'green',
      icon: 'i-heroicons-check-circle',
    })
  } catch (err: any) {
    toast.add({
      title: t('raid.hw_create_wizard.result_rescan_failed'),
      description: err?.data?.statusMessage ?? err?.message ?? t('raid.hw_create_wizard.submit_error'),
      color: 'red',
      icon: 'i-heroicons-x-circle',
    })
  } finally {
    rescanning.value = false
  }
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}
</script>
