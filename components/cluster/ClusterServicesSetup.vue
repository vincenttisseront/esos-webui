<template>
  <div class="space-y-5">
    <div>
      <h3 class="font-semibold text-gray-800">Configuration des services cluster</h3>
      <p class="text-sm text-gray-500 mt-1">
        Suivez les étapes dans l'ordre sur chaque nœud. Corosync doit être démarré avant Pacemaker.
      </p>
    </div>

    <!-- Avertissement SCST -->
    <UAlert
      color="amber"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      title="SCST doit être désactivé dans rc.conf"
      description="En mode cluster, c'est Pacemaker (ocf:esos:scst) qui démarre SCST. rc.scst_enable doit être à NO."
    />

    <!-- Un panneau par nœud -->
    <div
      v-for="node in props.nodes"
      :key="node.id"
      class="rounded-lg border border-gray-200 overflow-hidden"
    >
      <!-- En-tête nœud -->
      <div class="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <p class="text-sm font-medium text-gray-700">
          {{ node.label }}
          <span class="font-mono text-gray-400 font-normal ml-1">{{ node.host }}</span>
        </p>
        <div class="flex items-center gap-1.5">
          <span
            v-if="nodeReady(node.id)"
            class="flex items-center gap-1 text-xs text-green-600 font-medium"
          >
            <UIcon name="i-heroicons-check-circle" class="w-4 h-4" /> Prêt
          </span>
          <span v-else class="text-xs text-gray-400">En attente…</span>
        </div>
      </div>

      <div class="p-4 space-y-3">
        <!-- Étapes ordonnées -->
        <div class="space-y-2">
          <div
            v-for="(step, idx) in getSteps(node.id)"
            :key="step.key"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
            :class="[
              step.done  ? 'bg-green-50 border border-green-200' :
              step.active ? 'bg-blue-50 border border-blue-200' :
                            'bg-gray-50 border border-gray-200 opacity-50'
            ]"
          >
            <!-- Numéro / check -->
            <div
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              :class="[
                step.done   ? 'bg-green-500 text-white' :
                step.active ? 'bg-blue-500 text-white' :
                              'bg-gray-300 text-gray-500'
              ]"
            >
              <UIcon v-if="step.done" name="i-heroicons-check" class="w-3.5 h-3.5" />
              <span v-else>{{ idx + 1 }}</span>
            </div>

            <!-- Libellé -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium" :class="step.done ? 'text-green-700' : step.active ? 'text-blue-800' : 'text-gray-400'">
                {{ step.label }}
              </p>
              <p v-if="!step.done && step.hint" class="text-xs text-gray-400 mt-0.5">{{ step.hint }}</p>
            </div>

            <!-- Bouton action / état vérification -->
            <span
              v-if="verifying[`${node.id}:${step.key}`]"
              class="flex items-center gap-1 text-xs text-blue-600 font-medium shrink-0"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
              Vérification…
            </span>
            <UButton
              v-else-if="!step.done"
              :label="step.action"
              size="xs"
              :color="step.active ? 'blue' : 'gray'"
              :variant="step.active ? 'solid' : 'outline'"
              :disabled="!step.active"
              :loading="pending[`${node.id}:${step.key}`]"
              @click="runStep(node.id, step)"
            />
            <UIcon
              v-else
              name="i-heroicons-check-circle"
              class="w-5 h-5 text-green-500 shrink-0"
            />
          </div>
        </div>

        <!-- Sortie terminal -->
        <div
          v-if="lastOutput[node.id] && !nodeReady(node.id)"
          class="rounded bg-gray-900 text-green-400 text-xs p-2.5 font-mono max-h-24 overflow-y-auto whitespace-pre-wrap"
        >{{ lastOutput[node.id] }}</div>
      </div>
    </div>

    <!-- Actions globales -->
    <div class="flex items-center gap-2">
      <UButton
        v-if="allReady"
        label="Services prêts — Continuer"
        icon="i-heroicons-arrow-right"
        trailing
        @click="emit('services-ready')"
      />
      <UButton
        label="Rafraîchir le statut"
        icon="i-heroicons-arrow-path"
        color="gray"
        variant="ghost"
        :loading="refreshing"
        @click="refreshStatus"
      />
    </div>

    <!-- Bloc DRBD / Pacemaker (§9) -->
    <UDivider class="my-1" />
    <div class="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 space-y-3">
      <div class="flex items-start gap-2">
        <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p class="text-sm font-semibold text-blue-800">DRBD et Pacemaker</p>
          <p class="text-xs text-blue-600 mt-0.5">
            Quand Pacemaker gère DRBD (via le RA <code class="bg-blue-100 px-1 rounded">ocf:linbit:drbd</code>),
            le service autonome <code class="bg-blue-100 px-1 rounded">rc.drbd</code> doit rester
            <strong>désactivé</strong> (<code class="bg-blue-100 px-1 rounded">rc.drbd_enable=NO</code>).
            Pacemaker démarre et arrête DRBD lui-même.
          </p>
        </div>
      </div>

      <div class="flex items-center justify-between text-sm">
        <div>
          <p class="text-blue-800 font-medium">Mode standalone DRBD</p>
          <p class="text-xs text-blue-500 mt-0.5">Active <code class="bg-blue-100 px-1 rounded">rc.drbd_enable=YES</code> sur tous les nœuds</p>
        </div>
        <USwitch
          v-model="drbdStandalone"
          size="sm"
          :disabled="togglingDRBD"
          @update:model-value="toggleDRBD"
        />
      </div>

      <UAlert
        v-if="drbdStandalone"
        color="amber"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        title="Mode standalone activé"
        description="rc.drbd_enable=YES désactive la gestion Pacemaker de DRBD. À utiliser uniquement pour des tests ou une configuration sans cluster."
        size="sm"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface NodeInfo { id: string; label: string; host: string }

interface Step {
  key:     string
  label:   string
  action:  string
  hint?:   string
  done:    boolean
  active:  boolean
  service: 'corosync' | 'pacemaker'
  act:     'enable' | 'start'
}

interface NodeStatus {
  corosyncEnabled:  boolean
  corosyncRunning:  boolean
  pacemakerEnabled: boolean
  pacemakerRunning: boolean
}

const props = defineProps<{ nodes: NodeInfo[] }>()
const emit  = defineEmits<{ (e: 'services-ready'): void }>()

const pending       = ref<Record<string, boolean>>({})
const verifying     = ref<Record<string, boolean>>({})
const lastOutput    = ref<Record<string, string>>({})
const nodeStatus    = ref<Record<string, NodeStatus>>({})
const refreshing    = ref(false)

const allReady = computed(() => props.nodes.every(n => nodeReady(n.id)))

function nodeReady(nodeId: string): boolean {
  const s = nodeStatus.value[nodeId]
  return !!(s?.corosyncRunning && s?.pacemakerRunning)
}

/**
 * Les 4 étapes ordonnées pour un nœud.
 * Chaque étape n'est active que si la précédente est terminée.
 */
function getSteps(nodeId: string): Step[] {
  const s = nodeStatus.value[nodeId] ?? {
    corosyncEnabled: false, corosyncRunning: false,
    pacemakerEnabled: false, pacemakerRunning: false,
  }

  const steps: Step[] = [
    {
      key:     'corosync:enable',
      label:   'Activer Corosync au démarrage',
      action:  'Activer',
      hint:    'rc.corosync_enable="YES" dans rc.conf',
      done:    s.corosyncEnabled,
      active:  !s.corosyncEnabled,
      service: 'corosync',
      act:     'enable',
    },
    {
      key:     'corosync:start',
      label:   'Démarrer Corosync',
      action:  'Démarrer',
      hint:    'Doit être activé (étape 1) d\'abord',
      done:    s.corosyncRunning,
      active:  s.corosyncEnabled && !s.corosyncRunning,
      service: 'corosync',
      act:     'start',
    },
    {
      key:     'pacemaker:enable',
      label:   'Activer Pacemaker au démarrage',
      action:  'Activer',
      hint:    'Corosync doit tourner (étape 2) d\'abord',
      done:    s.pacemakerEnabled,
      active:  s.corosyncRunning && !s.pacemakerEnabled,
      service: 'pacemaker',
      act:     'enable',
    },
    {
      key:     'pacemaker:start',
      label:   'Démarrer Pacemaker',
      action:  'Démarrer',
      hint:    'Doit être activé (étape 3) d\'abord',
      done:    s.pacemakerRunning,
      active:  s.pacemakerEnabled && !s.pacemakerRunning,
      service: 'pacemaker',
      act:     'start',
    },
  ]

  return steps
}

async function runStep(nodeId: string, step: Step) {
  const key = `${nodeId}:${step.key}`
  pending.value[key]   = true
  verifying.value[key] = false
  lastOutput.value[nodeId] = ''
  try {
    const res = await $fetch<{ output: string }>('/api/cluster/service', {
      method: 'POST',
      body:   { nodeId, service: step.service, action: step.act },
    })
    lastOutput.value[nodeId] = res.output.trim().slice(0, 400) || '(succès)'

    // Vérification effective : polling jusqu'à ce que l'état corresponde (max 15s)
    pending.value[key]   = false
    verifying.value[key] = true
    const confirmed = await pollUntilDone(nodeId, step)
    if (confirmed) {
      // Étape confirmée — on vide l'output pour ne pas polluer l'étape suivante
      lastOutput.value[nodeId] = ''
    } else {
      lastOutput.value[nodeId] += '\n⚠️ Délai dépassé — la tâche n\'a pas pu être confirmée. Vérifiez manuellement.'
    }
  } catch (err: any) {
    lastOutput.value[nodeId] = `Erreur : ${err?.data?.message ?? String(err)}`
  } finally {
    pending.value[key]   = false
    verifying.value[key] = false
  }
}

/**
 * Interroge /api/cluster/status toutes les 2s jusqu'à 15s pour vérifier
 * que l'action est bien reflétée dans l'état réel du nœud.
 * Retourne true si confirmé, false si timeout.
 */
async function pollUntilDone(nodeId: string, step: Step): Promise<boolean> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2_000))
    await refreshStatus()
    const s = nodeStatus.value[nodeId]
    if (!s) continue
    const confirmed =
      (step.act === 'enable' && step.service === 'corosync'  && s.corosyncEnabled)  ||
      (step.act === 'start'  && step.service === 'corosync'  && s.corosyncRunning)  ||
      (step.act === 'enable' && step.service === 'pacemaker' && s.pacemakerEnabled) ||
      (step.act === 'start'  && step.service === 'pacemaker' && s.pacemakerRunning)
    if (confirmed) return true
  }
  return false
}

async function refreshStatus() {
  refreshing.value = true
  const ids = props.nodes.map(n => n.id).join(',')
  try {
    const res = await $fetch<{ nodes: Array<NodeStatus & { nodeId: string }> }>('/api/cluster/status', {
      query: { nodeIds: ids },
    })
    for (const n of res.nodes ?? []) {
      nodeStatus.value[n.nodeId] = {
        corosyncEnabled:  n.corosyncEnabled,
        corosyncRunning:  n.corosyncRunning,
        pacemakerEnabled: n.pacemakerEnabled,
        pacemakerRunning: n.pacemakerRunning,
      }
    }
  } catch { /* silencieux */ } finally {
    refreshing.value = false
  }
}

onMounted(refreshStatus)

// ─── Toggle DRBD standalone ───────────────────────────────────────────────────

const drbdStandalone = ref(false)
const togglingDRBD   = ref(false)

async function toggleDRBD(value: boolean) {
  togglingDRBD.value = true
  const action: 'enable' | 'disable' = value ? 'enable' : 'disable'
  const errors: string[] = []

  await Promise.all(props.nodes.map(async (node) => {
    try {
      await $fetch('/api/cluster/service', {
        method: 'POST',
        body:   { nodeId: node.id, service: 'drbd', action },
      })
    } catch (err: any) {
      errors.push(`${node.label}: ${err?.data?.message ?? 'Erreur'}`)
    }
  }))

  if (errors.length > 0) {
    useAppToast().error('Erreur toggle DRBD', errors.join(' | '))
    drbdStandalone.value = !value  // revert
  }
  togglingDRBD.value = false
}
</script>

