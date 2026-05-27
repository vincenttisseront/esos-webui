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
      <div v-else-if="step === 1" class="space-y-4">
        <UFormGroup :label="t('raid.hw_create_wizard.raid_level')" required>
          <USelect v-model="form.raidLevel" :items="hwLevelOptions" value-key="value" class="w-full" />
        </UFormGroup>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {{ t('raid.hw_create_wizard.min_drives', { min: minDrives, level: form.raidLevel }) }}
        </p>
      </div>

      <!-- Étape 2 : Sélection disques -->
      <div v-else-if="step === 2" class="space-y-3">
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('raid.hw_create_wizard.select_drives', { min: minDrives }) }}</p>
        <div class="max-h-72 overflow-y-auto space-y-1">
          <label
            v-for="drive in availableDrives"
            :key="`${drive.enclosure}-${drive.slot}`"
            class="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-50 dark:bg-gray-950 cursor-pointer"
          >
            <input
              type="checkbox"
              :value="{ enclosure: drive.enclosure, slot: drive.slot }"
              v-model="form.drives"
              class="accent-purple-500"
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
      <div v-else-if="step === 3" class="space-y-4">
        <UFormGroup :label="t('raid.hw_create_wizard.read_policy')">
          <USelect v-model="form.readPolicy" :items="readPolicyOptions" value-key="value" class="w-full" />
        </UFormGroup>
        <UFormGroup :label="t('raid.hw_create_wizard.write_policy')">
          <USelect v-model="form.writePolicy" :items="writePolicyOptions" value-key="value" class="w-full" />
          <template #hint>
            <span class="text-amber-600 text-xs">{{ t('raid.hw_create_wizard.write_policy_hint') }}</span>
          </template>
        </UFormGroup>
        <UFormGroup :label="t('raid.hw_create_wizard.volume_name')">
          <UInput v-model="form.name" :placeholder="t('raid.hw_create_wizard.volume_name_placeholder')" />
        </UFormGroup>
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

      <!-- Étape 5 : Confirmation -->
      <div v-else-if="step === 5" class="space-y-4">
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
        @click="step === 0 ? $emit('cancel') : step--"
      >
        {{ step === 0 ? t('raid.page.cancel') : t('raid.hw_create_wizard.back') }}
      </UButton>
      <UButton
        v-if="step < steps.length - 1"
        color="purple"
        :disabled="!canNext || busy"
        @click="handleNext"
      >
        {{ t('raid.hw_create_wizard.next') }}
      </UButton>
      <UButton
        v-else
        color="green"
        :disabled="!canSubmit || busy"
        :loading="busy"
        icon="i-heroicons-bolt"
        @click="submit"
      >
        {{ t('raid.hw_create_wizard.create') }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HardwareRaidController, HardwareRaidPhysicalDrive, RaidPreflightResult } from '~/types/raid'
import {
  assessHwRaidCreateEligibility,
  type HwRaidCreateIneligibilityReason,
} from '~/utils/raid-hw-create-eligibility'

const props = defineProps<{
  controllers: HardwareRaidController[]
  initialControllerId?: string
  sanReadOnly?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const { t } = useI18n()
const raid = useRaidStore()

const steps = computed(() => [
  t('raid.hw_create_wizard.step.controller'),
  t('raid.hw_create_wizard.step.level'),
  t('raid.hw_create_wizard.step.drives'),
  t('raid.hw_create_wizard.step.cache'),
  t('raid.hw_create_wizard.step.preflight'),
  t('raid.hw_create_wizard.step.confirm'),
])

const step = ref(0)
const busy = ref(false)
const understood = ref(false)
const submitError = ref<string | null>(null)
const preflightResult = ref<RaidPreflightResult | null>(null)
const preflightLoading = ref(false)

const form = reactive({
  controllerId: '',
  raidLevel: '1' as '0' | '1' | '5' | '6' | '10',
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

const hwLevelOptions = computed(() => [
  { label: 'RAID 0', value: '0' },
  { label: 'RAID 1', value: '1' },
  { label: 'RAID 5', value: '5' },
  { label: 'RAID 6', value: '6' },
  { label: 'RAID 10', value: '10' },
])

const readPolicyOptions = computed(() => [
  { label: t('raid.hw_create_wizard.policy.nora'), value: 'NORA' },
  { label: t('raid.hw_create_wizard.policy.ra'), value: 'RA' },
  { label: t('raid.hw_create_wizard.policy.adra'), value: 'ADRA' },
])

const writePolicyOptions = computed(() => [
  { label: t('raid.hw_create_wizard.policy.wt'), value: 'WT' },
  { label: t('raid.hw_create_wizard.policy.wb'), value: 'WB' },
])

const minDrives = computed(() => {
  const map: Record<string, number> = { '0': 2, '1': 2, '5': 3, '6': 4, '10': 4 }
  return map[form.raidLevel] ?? 2
})

const canNext = computed(() => {
  if (step.value === 0) return !!form.controllerId && eligibleEntries.value.some(e => e.controller.id === form.controllerId)
  if (step.value === 2) return form.drives.length >= minDrives.value
  if (step.value === 4) return !!preflightResult.value?.ok
  return true
})

const canSubmit = computed(() =>
  understood.value
  && preflightResult.value?.ok
  && (!preflightResult.value.requiredConfirmation || form.confirmation === preflightResult.value.requiredConfirmation),
)

function selectController(id: string) {
  form.controllerId = id
  form.drives = []
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
})

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
  busy.value = true
  submitError.value = null
  try {
    await raid.createHardwareLogicalDrive({
      controllerId: form.controllerId,
      raidLevel: form.raidLevel,
      drives: form.drives,
      name: form.name || undefined,
      sizeMode: 'max',
      readPolicy: form.readPolicy,
      writePolicy: form.writePolicy,
      confirmation: form.confirmation,
    })
    emit('confirm')
  } catch (err: any) {
    submitError.value = err?.data?.statusMessage ?? err.message ?? t('raid.hw_create_wizard.submit_error')
  } finally {
    busy.value = false
  }
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}
</script>
