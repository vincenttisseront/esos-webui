<template>
  <div class="p-6 space-y-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Administration des SANs</h1>
        <p class="text-sm text-gray-500">
          {{ isViewer ? 'Visualisation des serveurs ESOS connectés.' : 'Gestion des serveurs ESOS connectés.' }}
        </p>
      </div>
      <UButton
        v-if="!isViewer"
        color="primary"
        icon="i-heroicons-plus"
        @click="showForm = !showForm"
      >
        {{ showForm ? 'Annuler' : 'Ajouter un SAN' }}
      </UButton>
    </header>

    <!-- Création -->
    <UCard v-if="showForm && !isViewer">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-server-stack" class="w-5 h-5 text-primary-500" />
          <h2 class="font-semibold">Nouveau SAN</h2>
        </div>
      </template>

      <form class="space-y-5" @submit.prevent="onCreate">

        <!-- Identité -->
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Identité</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormGroup label="Label" required>
              <UInput v-model="form.label" placeholder="esos-prod-01" icon="i-heroicons-tag" />
            </UFormGroup>
            <UFormGroup label="Description">
              <UInput v-model="form.description" placeholder="Optionnel" />
            </UFormGroup>
          </div>
        </div>

        <UDivider />

        <!-- Connexion -->
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Connexion SSH</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="block text-sm font-medium text-gray-700">
                Hôte <span class="text-red-500">*</span>
              </label>
              <div class="flex rounded-md shadow-sm ring-1 ring-inset ring-gray-300 focus-within:ring-2 focus-within:ring-primary-500 bg-white overflow-hidden h-9">
                <span class="flex items-center pl-3 pr-2 text-gray-400 border-r border-gray-200 shrink-0">
                  <UIcon name="i-heroicons-server" class="w-4 h-4" />
                </span>
                <input
                  v-model="form.host"
                  type="text"
                  placeholder="192.168.1.10"
                  class="flex-1 min-w-0 px-3 text-sm bg-white outline-none text-gray-900 placeholder-gray-400"
                />
                <span class="flex items-center px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 font-mono select-none shrink-0">:</span>
                <input
                  v-model.number="form.port"
                  type="number"
                  placeholder="22"
                  class="w-16 px-2 text-sm bg-gray-50 outline-none text-gray-700 font-mono text-center border-l border-gray-100"
                />
              </div>
            </div>
            <UFormGroup label="Utilisateur SSH" required>
              <UInput v-model="form.username" placeholder="root" icon="i-heroicons-user" />
            </UFormGroup>
          </div>
        </div>

        <UDivider />

        <!-- Authentification -->
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Authentification</p>

          <div class="flex rounded-lg overflow-hidden border border-gray-200 w-fit mb-4">
            <button
              type="button"
              class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
              :class="form.authType === 'key' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
              @click="form.authType = 'key'"
            >
              <UIcon name="i-heroicons-key" class="w-4 h-4" />
              Clé SSH
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-l border-gray-200 transition-colors"
              :class="form.authType === 'password' ? 'bg-primary-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
              @click="form.authType = 'password'"
            >
              <UIcon name="i-heroicons-lock-closed" class="w-4 h-4" />
              Mot de passe
            </button>
          </div>

          <UFormGroup
            v-if="form.authType === 'key'"
            label="Clé privée (PEM ou OpenSSH)"
            required
            hint="Contenu du fichier id_rsa ou id_ed25519"
          >
            <UTextarea
              v-model="form.privateKey"
              :rows="6"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
              class="font-mono text-xs"
            />
          </UFormGroup>

          <UFormGroup
            v-if="form.authType === 'password'"
            label="Mot de passe"
            required
            class="max-w-xs"
          >
            <UInput v-model="form.password" type="password" placeholder="••••••••" />
          </UFormGroup>
        </div>

        <UDivider />

        <!-- Options -->
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Options</p>
          <label class="flex items-center gap-3 cursor-pointer select-none group w-fit">
            <input
              id="form-web-edit"
              v-model="form.readOnly"
              type="checkbox"
              :true-value="false"
              :false-value="true"
              class="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500 cursor-pointer"
            />
            <span class="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
              Permettre l'édition depuis l'interface web
            </span>
          </label>
        </div>

        <UAlert v-if="formError" color="red" variant="soft" :title="formError" />

        <div class="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <UButton variant="ghost" color="gray" type="button" @click="resetForm">Réinitialiser</UButton>
          <UButton type="submit" :loading="creating" color="primary" icon="i-heroicons-plus">Créer</UButton>
        </div>
      </form>
    </UCard>

    <!-- Chargement initial -->
    <div v-if="pending && !sans?.length" class="text-gray-400 py-8 text-center">Chargement…</div>
    <div v-else-if="!sans?.length" class="text-gray-400 py-8 text-center">
      Aucun SAN déclaré. Créez-en un avec le bouton ci-dessus.
    </div>

    <template v-else>
      <p
        v-if="clusterGroups.length"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        {{ t('cluster.fleet_summary', {
          clusters: clusterGroups.length,
          standalone: standaloneSans.length,
          attention: fleetNeedsAttention,
        }) }}
      </p>
      <!-- ── Clusters ── -->
      <template v-if="clusterGroups.length">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-gray-700 flex items-center gap-2">
            <UIcon name="i-heroicons-server-stack" class="w-4 h-4 text-indigo-500" />
            Clusters HA
          </h2>
          <UButton variant="ghost" icon="i-heroicons-arrow-path" :loading="pending" size="xs" @click="refresh()" />
        </div>

        <AdminClusterCard
          v-for="group in clusterGroups"
          :key="group.clusterId"
          :cluster-id="group.clusterId"
          :cluster-name="group.clusterName"
          :nodes="group.sans"
          :overview="groupOverview(group)"
          :attention="groupAttention(group)"
          :live-statuses="liveStatuses"
          :is-viewer="isViewer"
          :testing="testing"
          :reconnecting="reconnecting"
          :toggling="toggling"
          :syncing="syncing[group.clusterId]"
          :probing="probing[group.clusterId]"
          @configure="onClusterConfigure"
          @monitor="onClusterMonitor"
          @test-all="onClusterTestAll"
          @reconnect-all="onClusterReconnectAll"
          @sync="onClusterSync"
          @probe="onClusterProbe"
          @storage="onClusterStorage"
          @test-node="onTest"
          @reconnect-node="onReconnect"
          @remove-node="onRemoveClusterNode"
          @toggle-read-only="onToggleReadOnly"
        />
      </template>

      <!-- ── SANs seuls ── -->
      <template v-if="standaloneSans.length || !clusterGroups.length">
        <div class="flex items-center justify-between" :class="clusterGroups.length ? 'mt-2' : ''">
          <h2 class="text-base font-semibold text-gray-700 flex items-center gap-2">
            <UIcon name="i-heroicons-server" class="w-4 h-4 text-gray-400" />
            SANs autonomes
          </h2>
          <UButton v-if="!clusterGroups.length" variant="ghost" icon="i-heroicons-arrow-path" :loading="pending" size="xs" @click="refresh()" />
        </div>
        <UCard>
          <SanTable :rows="standaloneSans" :live-statuses="liveStatuses" :is-viewer="isViewer" :testing="testing" :toggling="toggling" @test="onTest" @delete="onDelete" @toggle-read-only="onToggleReadOnly" />
        </UCard>
      </template>
    </template>

    <!-- Terminal de résultat du test SSH -->
    <div v-if="testResult" class="rounded-xl overflow-hidden border border-gray-700 shadow-md">
      <!-- Barre de titre style terminal -->
      <div class="flex items-center justify-between bg-gray-800 px-4 py-2">
        <div class="flex items-center gap-3">
          <div class="flex gap-1.5">
            <span class="w-3 h-3 rounded-full bg-red-500 opacity-80" />
            <span class="w-3 h-3 rounded-full bg-yellow-400 opacity-80" />
            <span class="w-3 h-3 rounded-full bg-green-500 opacity-80" />
          </div>
          <div class="flex items-center gap-2 ml-2">
            <UIcon name="i-heroicons-bolt" class="w-3.5 h-3.5 text-gray-400" />
            <span class="text-xs font-mono text-gray-300 font-semibold">{{ testResult.sanLabel }}</span>
            <span class="text-xs font-mono text-gray-500">— {{ testResult.sanHost }}</span>
          </div>
          <UBadge
            :color="testResult.success ? 'green' : 'red'"
            variant="subtle"
            size="xs"
            class="ml-2"
          >
            {{ testResult.success ? 'OK' : 'KO' }}
          </UBadge>
        </div>
        <UButton
          icon="i-heroicons-x-mark"
          size="xs"
          color="gray"
          variant="ghost"
          class="opacity-60 hover:opacity-100"
          @click="testResult = null"
        />
      </div>

      <!-- Corps terminal -->
      <div class="bg-gray-900 px-4 py-3 font-mono text-xs space-y-0.5 min-h-[80px]">
        <div
          v-for="(line, i) in testResult.lines"
          :key="i"
          class="flex gap-3"
        >
          <span class="text-gray-600 shrink-0 select-none">{{ line.ts }}</span>
          <span
            :class="{
              'text-gray-300': line.level === 'info',
              'text-green-400': line.level === 'ok',
              'text-red-400':   line.level === 'err',
            }"
          >{{ line.text }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNetworkPendingRestart } from '~/composables/useNetworkPendingRestart'
import type { ClusterWithNodes } from '~/server/api/admin/clusters/index.get'
import type { ClusterAttentionResponse } from '~/types/cluster-admin'
import type { ClusterOverview } from '~/server/utils/types'

const { isPending } = useNetworkPendingRestart()
const authStore = useAuthStore()
const isViewer  = computed(() => authStore.user?.role === 'viewer')
const router = useRouter()
interface SanRow {
  id: string
  label: string
  description: string | null
  host: string
  port: number
  username: string
  driver: string
  status: string
  authType: 'key' | 'password'
  readOnly: boolean
  clusterEnabled: boolean
  clusterRole:    string | null
  clusterId:      string | null
}

type SSHStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'
type StorageRoute = 'raid' | 'system-config' | 'performance'

interface ClusterGroup {
  clusterId: string
  clusterName: string
  sans: SanRow[]
}

const { data: sans, pending, refresh } = await useFetch<SanRow[]>(
  '/api/admin/sans',
  { default: () => [] },
)

const { data: clusters, refresh: refreshClusters } = await useFetch<ClusterWithNodes[]>(
  '/api/admin/clusters',
  { default: () => [] },
)

const clusterGroups = computed<ClusterGroup[]>(() => {
  if (!clusters.value?.length || !sans.value?.length) return []
  return clusters.value.map(c => ({
    clusterId:   c.id,
    clusterName: c.name,
    sans: sans.value!.filter(s => s.clusterId === c.id),
  })).filter(g => g.sans.length > 0)
})

const groupOverviewMap = reactive<Record<string, ClusterOverview>>({})
const groupAttentionMap = reactive<Record<string, ClusterAttentionResponse>>({})
const groupLoadingMap = reactive<Record<string, boolean>>({})

const { t } = useEsosI18n()
const { open: openModal } = useAppModal()

function groupOverview(group: ClusterGroup): ClusterOverview | undefined {
  return groupOverviewMap[group.clusterId]
}

function groupAttention(group: ClusterGroup): ClusterAttentionResponse | undefined {
  return groupAttentionMap[group.clusterId]
}

const fleetNeedsAttention = computed(() =>
  clusterGroups.value.filter(g => {
    const h = groupAttentionMap[g.clusterId]?.health
    return h === 'warning' || h === 'critical'
  }).length,
)

async function fetchGroupOverview(group: ClusterGroup) {
  if (!group.clusterId || groupLoadingMap[group.clusterId]) return
  groupLoadingMap[group.clusterId] = true
  try {
    groupOverviewMap[group.clusterId] = await $fetch<ClusterOverview>('/api/cluster/status', {
      query: { clusterId: group.clusterId },
    })
  } catch { /* aperçu non bloquant */ }
  finally {
    groupLoadingMap[group.clusterId] = false
  }
}

async function fetchGroupAttention(group: ClusterGroup) {
  if (!group.clusterId) return
  try {
    groupAttentionMap[group.clusterId] = await $fetch<ClusterAttentionResponse>('/api/cluster/attention', {
      query: { clusterId: group.clusterId, includeMd: 'true' },
    })
  } catch { /* non bloquant */ }
}

async function refreshClusterGroup(group: ClusterGroup) {
  await Promise.all([fetchGroupOverview(group), fetchGroupAttention(group)])
}

async function refreshAll() {
  await Promise.all([refresh(), refreshClusters()])
  await refreshLiveStatuses()
  await Promise.all(clusterGroups.value.map(group => refreshClusterGroup(group)))
}

const standaloneSans = computed(() =>
  (sans.value ?? []).filter(s => !s.clusterId),
)

// Statuts SSH live — polling toutes les 10s
const { data: liveStatuses } = useAsyncData<Record<string, SSHStatus>>(
  'san-live-statuses',
  () => $fetch('/api/admin/sans/statuses'),
  { default: () => ({}), watch: [], server: false },
)

async function refreshLiveStatuses() {
  liveStatuses.value = await $fetch<Record<string, SSHStatus>>('/api/admin/sans/statuses')
}

let pollingInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  pollingInterval = setInterval(async () => {
    await refreshLiveStatuses()
  }, 10_000)
  for (const group of clusterGroups.value) {
    void refreshClusterGroup(group)
  }
})
onUnmounted(() => {
  if (pollingInterval) clearInterval(pollingInterval)
})

watch(clusterGroups, (groups) => {
  for (const group of groups) {
    if (!groupOverviewMap[group.clusterId]) {
      fetchGroupOverview(group)
    }
  }
})

function liveStatusLabel(s: SSHStatus | undefined): string {
  switch (s) {
    case 'connected':    return 'Connecté'
    case 'connecting':   return 'Connexion…'
    case 'reconnecting': return 'Reconnexion…'
    case 'error':        return 'Erreur'
    default:             return 'Non initialisé'
  }
}

function liveStatusDot(s: SSHStatus | undefined): string {
  switch (s) {
    case 'connected':    return 'bg-green-400'
    case 'connecting':   return 'bg-yellow-400 animate-pulse'
    case 'reconnecting': return 'bg-orange-400 animate-pulse'
    case 'error':        return 'bg-red-400'
    default:             return 'bg-gray-300'
  }
}

function liveStatusTextColor(s: SSHStatus | undefined): string {
  switch (s) {
    case 'connected':    return 'text-green-600'
    case 'connecting':   return 'text-yellow-600'
    case 'reconnecting': return 'text-orange-600'
    case 'error':        return 'text-red-600'
    default:             return 'text-gray-400'
  }
}

const showForm  = ref(false)
const creating  = ref(false)
const formError = ref<string | null>(null)
const testing   = reactive<Record<string, boolean>>({})
const reconnecting = reactive<Record<string, boolean>>({})
const toggling  = reactive<Record<string, boolean>>({})
const syncing   = reactive<Record<string, boolean>>({})
const probing   = reactive<Record<string, boolean>>({})

type TerminalLine = { ts: string; level: 'info' | 'ok' | 'err'; text: string }
const testResult = ref<{
  success: boolean
  sanLabel: string
  sanHost: string
  lines: TerminalLine[]
} | null>(null)

const initialForm = () => ({
  label: '',
  description: '',
  host: '',
  port: 22,
  username: 'root',
  driver: 'iscsi',
  readOnly: false,
  authType: 'key' as 'key' | 'password',
  privateKey: '',
  password: '',
})
const form = reactive(initialForm())

function resetForm() {
  Object.assign(form, initialForm())
  formError.value = null
}

function statusColor(status: string) {
  switch (status) {
    case 'active':
      return 'green'
    case 'inactive':
      return 'gray'
    case 'maintenance':
      return 'yellow'
    default:
      return 'gray'
  }
}

async function onCreate() {
  creating.value = true
  formError.value = null
  try {
    await $fetch('/api/admin/sans', {
      method: 'POST',
      body: {
        label: form.label,
        description: form.description || undefined,
        host: form.host,
        port: form.port,
        username: form.username,
        driver: form.driver,
        readOnly: form.readOnly,
        authType: form.authType,
        privateKey:
          form.authType === 'key' ? form.privateKey : undefined,
        password:
          form.authType === 'password' ? form.password : undefined,
      },
    })
    resetForm()
    showForm.value = false
    await refreshAll()
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    formError.value = e.statusMessage || e.message || 'Erreur inconnue'
  } finally {
    creating.value = false
  }
}

async function onToggleReadOnly(san: SanRow) {
  toggling[san.id] = true
  const newReadOnly = !san.readOnly
  try {
    await $fetch(`/api/admin/sans/${san.id}`, {
      method: 'PUT',
      body: { readOnly: newReadOnly },
    })
    // Optimistic update
    const row = sans.value?.find(s => s.id === san.id)
    if (row) row.readOnly = newReadOnly
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    await modalAlert({
      title:   'Erreur',
      message: e.statusMessage || e.message || 'Erreur inconnue',
      level:   'error',
    })
  } finally {
    toggling[san.id] = false
  }
}

async function onRemoveClusterNode(nodeId: string) {
  const san = sans.value?.find(s => s.id === nodeId)
  if (!san?.clusterId || isViewer.value) return
  const group = groupById(san.clusterId)
  if (!group) return
  const primary = group.sans.find(n => n.clusterRole === 'primary')
  try {
    const { default: ClusterRemoveNodeModal } = await import('~/components/cluster/ClusterRemoveNodeModal.vue')
    await openModal({
      component: ClusterRemoveNodeModal,
      props: {
        nodeId,
        nodeLabel: san.label,
        clusterId: san.clusterId,
        clusterName: group.clusterName,
        primaryNodeId: primary?.id ?? null,
        isPrimary: san.clusterRole === 'primary',
      },
    })
    await refreshAll()
  } catch {
    // modal dismissed
  }
}

async function onDelete(id: string) {
  const san = sans.value?.find(s => s.id === id)
  if (san?.clusterId) {
    await onRemoveClusterNode(id)
    return
  }
  const confirmed = await modalConfirm({
    title:   'Supprimer ce SAN ?',
    message: 'La connexion SSH sera fermée.',
    intent:  'danger',
  })
  if (!confirmed) return
  try {
    await $fetch(`/api/admin/sans/${id}`, { method: 'DELETE' })
    await refreshAll()
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    await modalAlert({
      title:   'Suppression échouée',
      message: e.statusMessage || e.message || 'Erreur inconnue',
      level:   'error',
    })
  }
}

async function onTest(id: string) {
  testing[id] = true
  testResult.value = null
  const san = sans.value?.find(s => s.id === id)
  try {
    const result = await runSanTest(id)
    testResult.value = {
      success: result.success,
      sanLabel: san?.label ?? id,
      sanHost:  `${san?.host ?? ''}:${san?.port ?? 22}`,
      lines: result.lines,
    }
  } finally {
    testing[id] = false
  }
}

async function runSanTest(id: string): Promise<{ success: boolean; lines: TerminalLine[] }> {
  const san = sans.value?.find(s => s.id === id)
  const ts = () => new Date().toLocaleTimeString('fr-FR', { hour12: false })
  const lines: TerminalLine[] = []
  lines.push({ ts: ts(), level: 'info', text: `Connexion SSH vers ${san?.host}:${san?.port ?? 22}…` })
  try {
    const res = await $fetch<{
      success: boolean
      status: string
      stdout?: string
      stderr?: string
      error?: string
      code?: number
    }>(`/api/admin/sans/${id}/test`)

    lines.push({ ts: ts(), level: 'info', text: `Status SSH : ${res.status}` })
    if (res.stdout?.trim()) lines.push({ ts: ts(), level: 'ok',  text: `stdout : ${res.stdout.trim()}` })
    if (res.stderr?.trim()) lines.push({ ts: ts(), level: 'err', text: `stderr : ${res.stderr.trim()}` })
    if (res.error)          lines.push({ ts: ts(), level: 'err', text: `Erreur : ${res.error}` })
    if (res.code !== undefined) lines.push({ ts: ts(), level: res.code === 0 ? 'ok' : 'err', text: `Exit code : ${res.code}` })
    lines.push({ ts: ts(), level: res.success ? 'ok' : 'err', text: res.success ? 'Test réussi' : 'Test échoué' })
    return { success: res.success, lines }
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    lines.push({ ts: ts(), level: 'err', text: `Erreur : ${e.statusMessage || e.message || 'Erreur inconnue'}` })
    return { success: false, lines }
  }
}

async function onReconnect(id: string) {
  reconnecting[id] = true
  try {
    await $fetch(`/api/admin/sans/${id}/reconnect`, { method: 'POST' })
    await refreshLiveStatuses()
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    await modalAlert({
      title:   'Reconnexion échouée',
      message: e.statusMessage || e.message || 'Erreur inconnue',
      level:   'error',
    })
  } finally {
    reconnecting[id] = false
  }
}

function groupById(clusterId: string) {
  return clusterGroups.value.find(g => g.clusterId === clusterId)
}

function onClusterConfigure(clusterId: string) {
  router.push({ path: '/admin/cluster', query: { clusterId } })
}

function onClusterMonitor(clusterId: string) {
  router.push({ path: '/cluster', query: { clusterId } })
}

function onClusterStorage(payload: { nodeId: string; route: StorageRoute }) {
  if (isViewer.value) return
  router.push({ path: `/admin/sans/${payload.nodeId}/${payload.route}` })
}

async function onClusterTestAll(clusterId: string) {
  const group = groupById(clusterId)
  if (!group || isViewer.value) return
  testResult.value = null
  const lines: TerminalLine[] = []
  for (const node of group.sans) testing[node.id] = true
  try {
    for (const node of group.sans) {
      const result = await runSanTest(node.id)
      lines.push({ ts: new Date().toLocaleTimeString('fr-FR', { hour12: false }), level: 'info', text: `--- ${node.label} ---` })
      lines.push(...result.lines)
    }
    const success = lines.every(line => line.level !== 'err')
    testResult.value = {
      success,
      sanLabel: group.clusterName,
      sanHost: `${group.sans.length} nœud${group.sans.length > 1 ? 's' : ''}`,
      lines,
    }
  } finally {
    for (const node of group.sans) testing[node.id] = false
  }
}

async function onClusterReconnectAll(clusterId: string) {
  const group = groupById(clusterId)
  if (!group || isViewer.value) return
  for (const node of group.sans) reconnecting[node.id] = true
  try {
    const results = await Promise.allSettled(
      group.sans.map(node => $fetch(`/api/admin/sans/${node.id}/reconnect`, { method: 'POST' })),
    )
    await refreshLiveStatuses()
    const failed = results.filter(r => r.status === 'rejected').length
    await modalAlert({
      title: failed ? 'Reconnexion partielle' : 'Reconnexion lancée',
      message: failed
        ? `${failed} nœud(s) n'ont pas pu être reconnectés.`
        : `Reconnexion lancée pour ${group.sans.length} nœud(s).`,
      level: failed ? 'warning' : 'info',
    })
  } finally {
    for (const node of group.sans) reconnecting[node.id] = false
  }
}

async function onClusterSync(clusterId: string) {
  const group = groupById(clusterId)
  if (!group || isViewer.value) return
  syncing[clusterId] = true
  try {
    const result = await $fetch<{ output: string }>('/api/cluster/sync', {
      method: 'POST',
      body: { clusterId },
    })
    await refreshClusterGroup(group)
    await modalAlert({
      title: 'Synchronisation réussie',
      message: result.output?.slice(0, 300) || 'conf_sync.sh exécuté sur le nœud primaire.',
      level: 'info',
    })
  } catch (err: unknown) {
    const e = err as { data?: { message?: string }; statusMessage?: string; message?: string }
    await modalAlert({
      title: 'Synchronisation échouée',
      message: e.data?.message || e.statusMessage || e.message || 'Erreur inconnue',
      level: 'error',
    })
  } finally {
    syncing[clusterId] = false
  }
}

async function onClusterProbe(clusterId: string) {
  const group = groupById(clusterId)
  if (!group || isViewer.value) return
  probing[clusterId] = true
  const ts = () => new Date().toLocaleTimeString('fr-FR', { hour12: false })
  const lines: TerminalLine[] = []
  try {
    const [overview, prereq] = await Promise.all([
      $fetch<ClusterOverview>('/api/cluster/status', { query: { clusterId } }),
      $fetch<Array<{ sanId: string; checks: Array<{ label: string; ok: boolean; detail: string }> }>>('/api/cluster/prereq', {
        query: { sanIds: group.sans.map(n => n.id) },
      }),
    ])
    groupOverviewMap[clusterId] = overview
    await fetchGroupAttention(group)
    lines.push({ ts: ts(), level: overview.healthy ? 'ok' : 'err', text: `Mode : ${overview.mode}, santé : ${overview.healthy ? 'saine' : 'dégradée'}` })
    for (const nodeResult of prereq) {
      const node = group.sans.find(n => n.id === nodeResult.sanId)
      lines.push({ ts: ts(), level: 'info', text: `--- ${node?.label ?? nodeResult.sanId} ---` })
      for (const check of nodeResult.checks) {
        lines.push({ ts: ts(), level: check.ok ? 'ok' : 'err', text: `${check.label} : ${check.detail || (check.ok ? 'OK' : 'KO')}` })
      }
    }
    testResult.value = {
      success: overview.healthy && lines.every(line => line.level !== 'err'),
      sanLabel: group.clusterName,
      sanHost: 'Probe cluster',
      lines,
    }
  } catch (err: unknown) {
    const e = err as { data?: { message?: string }; statusMessage?: string; message?: string }
    testResult.value = {
      success: false,
      sanLabel: group.clusterName,
      sanHost: 'Probe cluster',
      lines: [{ ts: ts(), level: 'err', text: e.data?.message || e.statusMessage || e.message || 'Erreur inconnue' }],
    }
  } finally {
    probing[clusterId] = false
  }
}
</script>
