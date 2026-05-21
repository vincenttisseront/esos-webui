<template>
  <div class="bg-white dark:bg-gray-900 rounded-xl shadow-modal w-full relative max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden outline-none" role="dialog" :aria-modal="true">
    <!-- Header -->
    <div class="px-5 pt-5 pb-0 shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-purple-500" />
          <h3 class="font-semibold text-gray-900 dark:text-gray-100">Étape {{ step + 1 }}/{{ steps.length }} — Créer un volume RAID matériel</h3>
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

    <!-- Corps -->
    <div class="px-5 py-4 min-h-0 flex-1 overflow-y-auto overscroll-contain">

      <!-- Étape 0 : Sélection contrôleur -->
      <div v-if="step === 0" class="space-y-3">
        <UFormGroup label="Contrôleur RAID" required>
          <USelect
            v-model="form.controllerId"
            :options="controllerOptions"
            placeholder="Sélectionnez un contrôleur"
          />
        </UFormGroup>
        <div v-if="selectedController" class="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 rounded px-3 py-2 space-y-1">
          <p>Vendeur : {{ selectedController.vendor }}</p>
          <p>CLI : {{ selectedController.cliTool }}</p>
          <p>Disques physiques disponibles : {{ availableDrives.length }}</p>
        </div>
      </div>

      <!-- Étape 1 : Niveau RAID -->
      <div v-else-if="step === 1" class="space-y-4">
        <UFormGroup label="Niveau RAID" required>
          <USelect v-model="form.raidLevel" :options="hwLevelOptions" />
        </UFormGroup>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Minimum {{ minDrives }} disques requis pour RAID{{ form.raidLevel }}.
        </p>
      </div>

      <!-- Étape 2 : Sélection disques -->
      <div v-else-if="step === 2" class="space-y-3">
        <p class="text-sm text-gray-600 dark:text-gray-400">Sélectionnez les disques physiques ({{ minDrives }} min) :</p>
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
          Sélectionnés : {{ form.drives.length }} / {{ minDrives }} requis
        </p>
      </div>

      <!-- Étape 3 : Politiques cache -->
      <div v-else-if="step === 3" class="space-y-4">
        <UFormGroup label="Politique de lecture">
          <USelect v-model="form.readPolicy" :options="readPolicyOptions" />
        </UFormGroup>
        <UFormGroup label="Politique d'écriture">
          <USelect v-model="form.writePolicy" :options="writePolicyOptions" />
          <template #hint>
            <span class="text-amber-600 text-xs">WB (Write-Back) améliore les performances mais requiert BBU</span>
          </template>
        </UFormGroup>
        <UFormGroup label="Nom du volume (optionnel)">
          <UInput v-model="form.name" placeholder="Mon volume" />
        </UFormGroup>
      </div>

      <!-- Étape 4 : Pré-vérification -->
      <div v-else-if="step === 4" class="space-y-3">
        <div v-if="preflightLoading" class="py-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
          Analyse en cours…
        </div>
        <RaidPreflightPanel v-else-if="preflightResult" :preflight="preflightResult" />
        <UAlert
          v-if="preflightResult && !preflightResult.ok"
          title="Opération bloquée"
          color="red"
          icon="i-heroicons-x-circle"
        />
      </div>

      <!-- Étape 5 : Confirmation -->
      <div v-else-if="step === 5" class="space-y-4">
        <RaidPreflightPanel v-if="preflightResult" :preflight="preflightResult" />
        <div v-if="preflightResult?.requiredConfirmation" class="space-y-2">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Saisissez exactement
            <code class="text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded font-mono text-xs">{{ preflightResult.requiredConfirmation }}</code>
            :
          </p>
          <UInput v-model="form.confirmation" class="font-mono" @paste.prevent />
        </div>
        <label class="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" v-model="understood" class="mt-0.5 accent-red-500" />
          <span class="text-sm text-gray-600 dark:text-gray-400">Je comprends que la création d'un volume matériel efface les disques sélectionnés.</span>
        </label>
        <p v-if="submitError" class="text-sm text-red-600">{{ submitError }}</p>
      </div>
    </div>

    <!-- Footer -->
    <div class="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 flex justify-between">
      <UButton
        color="gray"
        variant="ghost"
        :disabled="busy"
        @click="step === 0 ? $emit('cancel') : step--"
      >
        {{ step === 0 ? 'Annuler' : 'Retour' }}
      </UButton>
      <UButton
        v-if="step < steps.length - 1"
        color="purple"
        :disabled="!canNext || busy"
        @click="handleNext"
      >
        Suivant
      </UButton>
      <UButton
        v-else
        color="green"
        :disabled="!canSubmit || busy"
        :loading="busy"
        icon="i-heroicons-bolt"
        @click="submit"
      >
        Créer le volume
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HardwareRaidController, HardwareRaidPhysicalDrive, RaidPreflightResult } from '~/types/raid'

const props = defineProps<{
  controllers: HardwareRaidController[]
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
const raid = useRaidStore()

const steps = ['Contrôleur', 'Niveau RAID', 'Disques', 'Cache', 'Pré-vérification', 'Confirmation']
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

const controllerOptions = computed(() =>
  props.controllers.filter(c => c.supportsCreate).map(c => ({ label: `${c.model} (${c.id})`, value: c.id })),
)

const selectedController = computed(() =>
  props.controllers.find(c => c.id === form.controllerId),
)

const availableDrives = computed((): HardwareRaidPhysicalDrive[] =>
  (selectedController.value?.physicalDrives ?? []).filter(d => d.eligible),
)

const hwLevelOptions = [
  { label: 'RAID 0', value: '0' },
  { label: 'RAID 1', value: '1' },
  { label: 'RAID 5', value: '5' },
  { label: 'RAID 6', value: '6' },
  { label: 'RAID 10', value: '10' },
]

const readPolicyOptions = [
  { label: 'NORA — Pas de lecture anticipée', value: 'NORA' },
  { label: 'RA — Lecture anticipée', value: 'RA' },
  { label: 'ADRA — Lecture anticipée adaptative (recommandé)', value: 'ADRA' },
]

const writePolicyOptions = [
  { label: 'WT — Write-Through (sûr, recommandé sans BBU)', value: 'WT' },
  { label: 'WB — Write-Back (performant, nécessite BBU)', value: 'WB' },
]

const minDrives = computed(() => {
  const map: Record<string, number> = { '0': 2, '1': 2, '5': 3, '6': 4, '10': 4 }
  return map[form.raidLevel] ?? 2
})

const canNext = computed(() => {
  if (step.value === 0) return !!form.controllerId
  if (step.value === 2) return form.drives.length >= minDrives.value
  if (step.value === 4) return !!preflightResult.value?.ok
  return true
})

const canSubmit = computed(() =>
  understood.value
  && preflightResult.value?.ok
  && (!preflightResult.value.requiredConfirmation || form.confirmation === preflightResult.value.requiredConfirmation),
)

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
    submitError.value = err?.data?.statusMessage ?? err.message ?? 'Erreur lors de la création'
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
