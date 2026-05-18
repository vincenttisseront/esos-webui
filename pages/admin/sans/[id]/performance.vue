<template>
  <div class="p-6 space-y-6 max-w-4xl mx-auto">

    <!-- Header -->
    <header class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-4">
        <UButton
          to="/admin/sans"
          icon="i-heroicons-arrow-left"
          variant="ghost"
          size="sm"
          color="gray"
        />
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Agent de performance</h1>
          <p class="text-sm text-gray-500 mt-1">
            {{ san?.label ?? sanId }} — Configuration et pilotage du service ESOS perf-agent
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 pt-1">
        <PerfAgentStatusBadge :service="perf.service" />
        <UBadge
          v-if="perf.service"
          :color="perf.service.enabledOnBoot ? 'green' : 'gray'"
          :label="perf.service.enabledOnBoot ? 'Boot: Activé' : 'Boot: Désactivé'"
          size="xs"
        />
      </div>
    </header>

    <!-- Erreur globale -->
    <UAlert
      v-if="perf.error"
      color="red"
      icon="i-heroicons-exclamation-circle"
      :description="perf.error"
      @close="perf.error = null"
    />

    <!-- Section Service -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
        <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" />
        Contrôle du service
      </h2>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="action in serviceActions"
          :key="action.value"
          size="sm"
          :color="action.color"
          :variant="action.variant"
          :icon="action.icon"
          :label="action.label"
          :loading="perf.serviceLoading"
          @click="doServiceAction(action.value)"
        />
      </div>

      <div class="flex items-center gap-3">
        <label class="text-sm text-gray-600 dark:text-gray-400">Démarrage automatique</label>
        <UToggle
          :model-value="perf.service?.enabledOnBoot ?? false"
          :disabled="perf.serviceLoading"
          @update:model-value="toggleBoot"
        />
      </div>

      <div v-if="perf.service?.rawStatus" class="text-xs text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 rounded px-3 py-2">
        {{ perf.service.rawStatus }}
        <template v-if="perf.service.pid"> · PID {{ perf.service.pid }}</template>
        <template v-if="perf.service.uptimeSec"> · uptime {{ fmtUptime(perf.service.uptimeSec) }}</template>
      </div>
    </div>

    <!-- Section DB -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
        <UIcon name="i-heroicons-circle-stack" class="w-4 h-4" />
        Base de données
      </h2>

      <div v-if="perf.config" class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <p class="text-xs text-gray-400">Type</p>
          <p class="font-medium capitalize">{{ perf.config.dbType }}</p>
        </div>
        <div class="col-span-2">
          <p class="text-xs text-gray-400">URI (masqué)</p>
          <p class="font-mono text-xs truncate">{{ perf.config.dburiMasked || '—' }}</p>
        </div>
        <div>
          <p class="text-xs text-gray-400">Base</p>
          <p class="font-medium">{{ perf.config.dbName || '—' }}</p>
        </div>
      </div>

      <PerfDbTestPanel />
    </div>

    <!-- Section Configuration agent -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
          Configuration /etc/perf-agent.con
          <UBadge v-if="!perf.config?.rawExists" color="orange" label="Fichier absent" size="xs" />
        </h2>
        <UButton
          size="xs"
          :loading="perf.configLoading"
          icon="i-heroicons-arrow-path"
          variant="ghost"
          color="gray"
          @click="perf.fetchConfig()"
        />
      </div>

      <PerfAgentConfigForm
        v-if="configForm"
        v-model="configForm"
        :existing-dburi-masked="perf.config?.dburiMasked"
      />

      <!-- Block devices -->
      <div class="border-t border-gray-100 dark:border-gray-700 pt-4">
        <PerfBlockDeviceSelector
          v-model="selectedDevices"
          :devices="perf.blockDevices"
          :loading="blockDevicesLoading"
          @refresh="loadBlockDevices"
        />
      </div>

      <div class="flex justify-end gap-2">
        <UButton size="sm" color="gray" variant="ghost" label="Annuler" @click="resetForm" />
        <UButton
          size="sm"
          color="primary"
          icon="i-heroicons-check"
          label="Sauvegarder"
          :loading="perf.configLoading"
          @click="saveConfig"
        />
      </div>

      <!-- Avertissement restart -->
      <UAlert
        v-if="perf.service?.running && savedOnce"
        color="orange"
        icon="i-heroicons-exclamation-triangle"
        title="Redémarrage recommandé"
        description="La configuration a été modifiée. Redémarrez l'agent pour appliquer les changements."
        :actions="[{ label: 'Redémarrer', click: () => doServiceAction('restart') }]"
      />
    </div>

    <!-- Section Compaction -->
    <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
        <UIcon name="i-heroicons-archive-box" class="w-4 h-4" />
        Compaction et rétention
      </h2>

      <div class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
        <p>ESOS compacte automatiquement les données via <code class="font-mono text-xs bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded">croncompact.py</code> :</p>
        <ul class="list-disc pl-5 space-y-0.5 text-xs">
          <li>Jour précédent → samples toutes les 15 min, conservés 7 jours</li>
          <li>J-7 → samples horaires, jusqu'à 31 jours</li>
          <li>J-31 → 1 sample journalier, long terme</li>
        </ul>
      </div>

      <UAlert
        v-if="!compactionActive"
        color="orange"
        icon="i-heroicons-exclamation-triangle"
        description="La compaction ESOS semble désactivée. La base peut grossir rapidement si aucun mécanisme externe de purge n'est configuré."
      />
      <div v-else class="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
        <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
        <span>Compaction active</span>
        <code v-if="compactionLine" class="text-xs font-mono text-gray-500 ml-2">{{ compactionLine }}</code>
      </div>
    </div>

    <!-- Confirmation modals -->
    <UModal v-model="confirmModal.open">
      <UCard>
        <template #header>
          <p class="font-semibold">{{ confirmModal.title }}</p>
        </template>
        <p class="text-sm text-gray-600">{{ confirmModal.message }}</p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" label="Annuler" @click="confirmModal.open = false" />
            <UButton color="red" label="Confirmer" @click="confirmModal.confirm()" />
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { PerfAgentConfigUpdate, PerfServiceAction } from '~/server/utils/perf-agent-types'
import type { SanSummary } from '~/server/db/repositories/san.repository'

definePageMeta({ layout: 'default' })

const route = useRoute()
const sanId = route.params.id as string

// Récupération du label du SAN pour l'affichage dans le header
const { data: san } = await useFetch<SanSummary>(`/api/admin/sans/${sanId}`)

const perf = usePerfStore()
const savedOnce = ref(false)
const blockDevicesLoading = ref(false)
const compactionActive = ref(false)
const compactionLine = ref<string | undefined>()

// ── Configuration form ──────────────────────────────────────────────────────
const configForm = ref<PerfAgentConfigUpdate>({
  system: '',
  pollingIntervalSec: 5,
  blockDevices: [],
})

const selectedDevices = computed<string[]>({
  get: () => configForm.value.blockDevices,
  set: (v) => { configForm.value = { ...configForm.value, blockDevices: v } },
})

function resetForm() {
  if (!perf.config) return
  configForm.value = {
    system: perf.config.system,
    pollingIntervalSec: perf.config.pollingIntervalSec,
    blockDevices: [...perf.config.blockDevices],
    hostAddress: perf.config.hostAddress,
  }
}

async function saveConfig() {
  const ok = await perf.saveConfig(configForm.value)
  if (ok) savedOnce.value = true
}

// ── Block devices ───────────────────────────────────────────────────────────
async function loadBlockDevices() {
  blockDevicesLoading.value = true
  await perf.fetchBlockDevices()
  blockDevicesLoading.value = false
}

// ── Service actions ─────────────────────────────────────────────────────────
const confirmModal = reactive({
  open: false,
  title: '',
  message: '',
  confirm: () => {},
})

const serviceActions = [
  { value: 'start' as PerfServiceAction, label: 'Démarrer', icon: 'i-heroicons-play', color: 'green' as const, variant: 'soft' as const },
  { value: 'stop' as PerfServiceAction, label: 'Arrêter', icon: 'i-heroicons-stop', color: 'red' as const, variant: 'soft' as const },
  { value: 'restart' as PerfServiceAction, label: 'Redémarrer', icon: 'i-heroicons-arrow-path', color: 'orange' as const, variant: 'soft' as const },
]

async function doServiceAction(action: PerfServiceAction) {
  const needsConfirm =
    (action === 'stop' && perf.service?.running) ||
    (action === 'restart' && perf.service?.running)

  if (needsConfirm) {
    await new Promise<void>((resolve) => {
      confirmModal.title = action === 'stop' ? 'Arrêter l\'agent ?' : 'Redémarrer l\'agent ?'
      confirmModal.message = action === 'stop'
        ? 'La collecte de métriques sera interrompue.'
        : 'L\'agent sera brièvement indisponible.'
      confirmModal.confirm = () => { confirmModal.open = false; resolve() }
      confirmModal.open = true
    })
  }

  await perf.serviceAction(action)
}

async function toggleBoot(enabled: boolean) {
  if (!enabled && perf.service?.enabledOnBoot) {
    await new Promise<void>((resolve) => {
      confirmModal.title = 'Désactiver le démarrage automatique ?'
      confirmModal.message = 'L\'agent ne démarrera plus automatiquement au prochain redémarrage.'
      confirmModal.confirm = () => { confirmModal.open = false; resolve() }
      confirmModal.open = true
    })
  }
  await perf.serviceAction(enabled ? 'enable' : 'disable')
}

// ── Utils ────────────────────────────────────────────────────────────────────
function fmtUptime(sec: number): string {
  if (sec >= 86400) return `${Math.floor(sec / 86400)}j ${Math.floor((sec % 86400) / 3600)}h`
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${sec}s`
}

// ── Lifecycle — contexte SAN ──────────────────────────────────────────────────
onMounted(async () => {
  // Pointer le store vers ce SAN spécifique
  perf.sanId = sanId

  await Promise.all([perf.fetchConfig(), perf.fetchService()])
  resetForm()
  loadBlockDevices()

  try {
    const svc = perf.service as any
    if (svc?.compaction) {
      compactionActive.value = svc.compaction.active
      compactionLine.value = svc.compaction.cronLine
    }
  } catch { /* non bloquant */ }
})

onUnmounted(() => {
  // Réinitialiser le contexte SAN à la sortie de la page
  perf.sanId = null
})
</script>
