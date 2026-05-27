<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <UButton
          to="/admin/sans"
          icon="i-heroicons-arrow-left"
          variant="ghost"
          size="sm"
          color="gray"
        />
        <SectionTitle
          :title="pageTitle"
          icon="i-heroicons-wrench-screwdriver"
          :description="pageDescription"
        />
      </div>

      <div class="flex items-center gap-3">
        <SSHStatusBadge v-if="config" :status="config.sshStatus" />
        <UButton
          icon="i-heroicons-arrow-path"
          size="sm"
          color="gray"
          variant="outline"
          :label="t('admin.sysconfig.page.refresh') as string"
          :loading="loading"
          @click="reload"
        />
      </div>
    </div>

    <!-- SAN introuvable -->
    <UAlert
      v-if="sanError"
      color="red"
      variant="subtle"
      icon="i-heroicons-x-circle"
      :title="t('admin.sysconfig.page.san_not_found') as string"
      :description="sanError"
    />

    <template v-else>
      <UAlert
        v-if="clusterScope && !isClusterMember"
        color="amber"
        variant="subtle"
        icon="i-heroicons-exclamation-triangle"
        :title="t('admin.sysconfig.page.cluster_node_mismatch_title') as string"
        :description="t('admin.sysconfig.page.cluster_node_mismatch_desc') as string"
      >
        <template #actions>
          <UButton to="/admin/sans" size="xs" color="amber" variant="soft">
            {{ t('admin.sysconfig.page.cluster_node_mismatch_back') as string }}
          </UButton>
        </template>
      </UAlert>

      <!-- Bannière lecture seule -->
      <UAlert
        v-if="isReadOnly"
        color="red"
        variant="subtle"
        icon="i-heroicons-lock-closed"
        :title="t('admin.sysconfig.page.readonly_title') as string"
        :description="t('admin.sysconfig.page.readonly_desc') as string"
      />

      <!-- Spinner premier chargement -->
      <div v-if="loading && !config" class="flex justify-center py-16">
        <UIcon name="i-heroicons-arrow-path" class="size-8 text-gray-400 animate-spin" />
      </div>

      <template v-else>
        <!-- Spinner SSH en cours de reconnexion -->
        <div
          v-if="isSshConnecting"
          class="rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 px-5 py-5 flex items-center gap-4"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-blue-500 shrink-0 animate-spin" />
          <div>
            <p class="text-sm font-semibold text-blue-800">{{ t('admin.sysconfig.page.ssh_connecting_title') }}</p>
            <p class="text-xs text-blue-600 mt-0.5">{{ t('admin.sysconfig.page.ssh_connecting_desc') }}</p>
          </div>
        </div>

        <!-- Bannière SSH down globale -->
        <div
          v-if="isSshDown"
          class="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-5 py-4 flex items-start gap-3"
        >
          <UIcon name="i-heroicons-server" class="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-red-800 dark:text-red-300">{{ t('admin.sysconfig.page.ssh_down_title') }}</p>
            <p class="text-xs text-red-600 mt-1">
              {{ t('admin.sysconfig.page.ssh_down_desc') }}
            </p>
            <div class="flex gap-2 mt-3">
              <UButton
                size="xs" color="red" variant="outline"
                icon="i-heroicons-key"
                :label="t('admin.sysconfig.page.ssh_settings') as string"
                to="/admin/sans"
              />
              <UButton
                size="xs" color="gray" variant="outline"
                icon="i-heroicons-arrow-path"
                :label="t('admin.sysconfig.page.retry_ssh') as string"
                :loading="retrying"
                @click="retrySSH"
              />
              <UButton
                size="xs" color="orange" variant="outline"
                icon="i-heroicons-pencil"
                :label="(editingHost ? t('admin.sysconfig.page.cancel_edit_ip') : t('admin.sysconfig.page.change_ip')) as string"
                @click="editingHost = !editingHost"
              />
            </div>

            <!-- Formulaire inline changement d'adresse -->
            <div v-if="editingHost" class="mt-4 p-3 bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded-lg">
              <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3">
                {{ t('admin.sysconfig.page.update_ip_hint') }}
              </p>
              <div class="flex items-center gap-2">
                <div class="flex rounded-md shadow-sm ring-1 ring-gray-300 overflow-hidden flex-1">
                  <input
                    v-model="editHostForm.host"
                    type="text"
                    placeholder="192.168.1.10"
                    class="flex-1 min-w-0 px-3 py-1.5 text-sm bg-white dark:bg-gray-900 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  />
                  <span class="flex items-center px-2 text-xs text-gray-400 bg-gray-50 dark:bg-gray-950 border-l border-gray-200 dark:border-gray-700 font-mono select-none">:</span>
                  <input
                    v-model.number="editHostForm.port"
                    type="number"
                    placeholder="22"
                    class="w-16 px-2 py-1.5 text-sm bg-gray-50 dark:bg-gray-950 outline-none text-gray-700 dark:text-gray-300 font-mono text-center"
                  />
                </div>
                <UButton
                  size="sm"
                  icon="i-heroicons-check"
                  :label="t('admin.sysconfig.page.save_reconnect') as string"
                  :loading="savingHost"
                  :disabled="!editHostForm.host"
                  @click="updateHost"
                />
              </div>
              <p v-if="hostSaveError" class="text-xs text-red-600 mt-2">{{ hostSaveError }}</p>
            </div>
          </div>
        </div>

        <SysconfigClusterNodeBar
          v-if="clusterScope && isClusterMember"
          :cluster-name="clusterScope.name"
          :nodes="clusterScope.nodes"
          :selected-san-id="sanId"
          :role-label="clusterRoleLabel"
          @select="navigateToClusterNode"
        />

        <!-- Tab bar -->
        <div class="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          <button
            v-for="tab in visibleTabs"
            :key="tab.key"
            type="button"
            class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
            :class="activeTabKey === tab.key
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            @click="selectTab(tab.key)"
          >
            <UIcon :name="tab.icon" class="size-4 shrink-0" />
            {{ tab.label }}
            <!-- Indicateur d'erreur sur l'onglet -->
            <span
              v-if="tab.sectionStatus && tab.sectionStatus !== 'ok'"
              class="w-1.5 h-1.5 rounded-full"
              :class="tab.sectionStatus === 'unavailable' ? 'bg-amber-400' : 'bg-red-500'"
            />
          </button>
        </div>

        <!-- Tab panels -->
        <div>
          <!-- Réseau -->
          <div v-if="activeTabKey === 'network'">
            <SysconfigTabScopeNotice
              v-if="clusterScope"
              :scope-kind="tabScopeKind"
              :node-label="san?.label ?? sanId"
              :edits-disabled="isSshDown"
            />
            <SectionErrorState
              v-if="config?.network.status !== 'ok'"
              class="mb-4"
              :status="config?.network.status ?? 'unavailable'"
              :error="config?.network.error ?? null"
              :on-retry="reload"
              :on-force-show="() => forceShow.network = true"
            />
            <NetworkForm
              v-if="config?.network.status === 'ok' || forceShow.network"
              :san-id="sanId"
              :san-label="san?.label"
              :config="config?.network.data ?? emptyNetwork"
              @saved="reload"
            />
          </div>

          <!-- Date & Heure -->
          <div v-else-if="activeTabKey === 'datetime'">
            <SysconfigTabScopeNotice
              v-if="clusterScope"
              :scope-kind="tabScopeKind"
              :node-label="san?.label ?? sanId"
              :edits-disabled="isSshDown"
            />
            <SectionErrorState
              v-if="config?.dateTime.status !== 'ok'"
              class="mb-4"
              :status="config?.dateTime.status ?? 'unavailable'"
              :error="config?.dateTime.error ?? null"
              :on-retry="reload"
            />
            <DateTimeForm
              v-if="config?.dateTime.status === 'ok'"
              :san-id="sanId"
              :config="config.dateTime.data!"
              @saved="reload"
            />
          </div>

          <!-- Mail SMTP -->
          <div v-else-if="activeTabKey === 'smtp'">
            <SysconfigTabScopeNotice
              v-if="clusterScope"
              :scope-kind="tabScopeKind"
              :node-label="san?.label ?? sanId"
              :edits-disabled="isSshDown"
            />
            <SectionErrorState
              v-if="config?.smtp.status !== 'ok'"
              class="mb-4"
              :status="config?.smtp.status ?? 'unavailable'"
              :error="config?.smtp.error ?? null"
              :on-retry="reload"
              :on-force-show="() => forceShow.smtp = true"
            />
            <SMTPForm
              v-if="config?.smtp.status === 'ok' || forceShow.smtp"
              :san-id="sanId"
              :config="config?.smtp.data ?? emptySMTP"
              @saved="reload"
            />
          </div>

          <!-- Utilisateurs -->
          <div v-else-if="activeTabKey === 'users'">
            <SysconfigTabScopeNotice
              v-if="clusterScope"
              :scope-kind="tabScopeKind"
              :node-label="san?.label ?? sanId"
              :edits-disabled="isSshDown || isReadOnly"
            />
            <UsersPanel
              :san-id="sanId"
              :disabled="isReadOnly"
            />
          </div>

          <!-- Terminal (admin / opérateur — masqué pour viewer, Batch 2B.6) -->
          <div v-else-if="activeTabKey === 'terminal'">
            <SysconfigTabScopeNotice
              v-if="clusterScope"
              :scope-kind="tabScopeKind"
              :node-label="san?.label ?? sanId"
              :edits-disabled="isSshDown"
            />
            <ClientOnly>
              <TerminalPane :san-id="sanId" />
            </ClientOnly>
          </div>

          <!-- Mise à niveau ESOS -->
          <div v-else-if="activeTabKey === 'upgrade'">
            <SysconfigTabScopeNotice
              v-if="clusterScope"
              :scope-kind="tabScopeKind"
              :node-label="san?.label ?? sanId"
            />
            <UpgradeWorkspace
              :san-id="sanId"
              :initial-sub-tab="upgradeSubTab"
              :route-cluster-scope="routeClusterUpgradeScope"
              @sub-tab-change="onUpgradeSubTabChange"
            />
          </div>

          <!-- Système -->
          <div v-else-if="activeTabKey === 'system'" class="space-y-4">
            <SysconfigTabScopeNotice
              v-if="clusterScope"
              :scope-kind="tabScopeKind"
              :node-label="san?.label ?? sanId"
              :edits-disabled="isSshDown"
            />
            <SectionErrorState
              v-if="config?.hostname.status !== 'ok'"
              class="mb-4"
              :status="config?.hostname.status ?? 'unavailable'"
              :error="config?.hostname.error ?? null"
              :on-retry="reload"
              :on-force-show="() => forceShow.hostname = true"
            />
            <HostnameForm
              v-if="config?.hostname.status === 'ok' || forceShow.hostname"
              :san-id="sanId"
              :config="config?.hostname.data ?? emptyHostname"
              :disabled="isReadOnly || isSshDown"
              @saved="(v) => { if (config) config.hostname = { data: v, status: 'ok' } }"
            />
            <UDivider />
            <ConsoleKeymapPanel
              :san-id="sanId"
              :disabled="isReadOnly || isSshDown"
            />
            <UDivider />
            <!-- Power toujours disponible -->
            <SystemPanel
              :san-id="sanId"
              :fqdn="config?.hostname.data?.fqdn ?? ''"
            />
          </div>
        </div>

        <!-- Bottom bar -->
        <div class="flex items-center justify-end gap-3 text-sm text-gray-500 dark:text-gray-400 pt-2">
          <span>{{ t('admin.sysconfig.page.last_read') }} {{ lastReadLabel }}</span>
          <UButton
            :label="t('admin.sysconfig.page.refresh') as string"
            icon="i-heroicons-arrow-path"
            variant="ghost"
            size="sm"
            :loading="loading"
            @click="reload"
          />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { SystemConfigResponse } from '~/server/utils/types'
import type { SanSummary }           from '~/server/db/repositories/san.repository'
import { isUpgradeSubTab, type UpgradeSubTab } from '~/composables/useUpgradeScope'
import {
  type SysConfigTabKey,
  getSysconfigTabScope,
  useSysconfigClusterScope,
} from '~/composables/useSysconfigClusterScope'
import ConsoleKeymapPanel from '~/components/sysconfig/ConsoleKeymapPanel.vue'

const SYS_CONFIG_TAB_KEYS = new Set<SysConfigTabKey>([
  'network',
  'datetime',
  'smtp',
  'users',
  'upgrade',
  'system',
  'terminal',
])

function isSysConfigTabKey(key: string): key is SysConfigTabKey {
  return SYS_CONFIG_TAB_KEYS.has(key as SysConfigTabKey)
}

definePageMeta({ layout: 'default' })

const { t, tError } = useEsosI18n()

const route = useRoute()
const sanId = computed(() => route.params.id as string)

const authStore = useAuthStore()
const isViewer = computed(() => authStore.user?.role === 'viewer')

const { markPending, isPending } = useNetworkPendingRestart()

// ── SAN meta ─────────────────────────────────────────────────────────────────
const {
  data: san,
  error: sanFetchError,
} = await useFetch<SanSummary>(() => `/api/admin/sans/${sanId.value}`, {
  watch: [sanId],
})

const sanError   = computed(() => sanFetchError.value?.message ?? null)
const isReadOnly = computed(() => san.value?.readOnly ?? false)

// ── Config système ────────────────────────────────────────────────────────────
const loading  = ref(false)
const retrying = ref(false)
const config   = ref<SystemConfigResponse | null>(null)
const loadedAt = ref<number | null>(null)

const forceShow = reactive({ network: false, smtp: false, hostname: false })

// SSH state helpers
const isSshConnecting = computed(() =>
  config.value?.sshStatus === 'connecting' || config.value?.sshStatus === 'reconnecting',
)
const isSshDown = computed(() =>
  config.value !== null && !isSshConnecting.value && config.value.sshStatus !== 'connected',
)

// Auto-poll quand SSH est en cours de (re)connexion — toutes les 3s, abandon après 30s
const reconnectingAt = ref<number | null>(null)
let reconnectPoll: ReturnType<typeof setInterval> | null = null

watch(isSshConnecting, (val) => {
  if (val) {
    reconnectingAt.value = reconnectingAt.value ?? Date.now()
    if (!reconnectPoll) {
      reconnectPoll = setInterval(async () => {
        if (!isSshConnecting.value) {
          clearInterval(reconnectPoll!)
          reconnectPoll = null
          reconnectingAt.value = null
          return
        }
        const elapsed = Date.now() - (reconnectingAt.value ?? Date.now())
        if (elapsed > 30_000) {
          // Délai dépassé : recharger une dernière fois pour afficher l'erreur
          clearInterval(reconnectPoll!)
          reconnectPoll = null
          reconnectingAt.value = null
          await reload()
          return
        }
        await reload()
      }, 3_000)
    }
  } else {
    reconnectingAt.value = null
    if (reconnectPoll) {
      clearInterval(reconnectPoll)
      reconnectPoll = null
    }
  }
})

onBeforeUnmount(() => {
  if (reconnectPoll) { clearInterval(reconnectPoll); reconnectPoll = null }
})

async function reload() {
  loading.value = true
  try {
    const data = await $fetch<SystemConfigResponse>(`/api/san/${sanId.value}/system-config`)
    config.value  = data
    loadedAt.value = Date.now()
    // Réinitialiser forceShow si les données sont maintenant ok
    if (data.hostname.status === 'ok') forceShow.hostname = false
    if (data.network.status  === 'ok') forceShow.network  = false
    if (data.smtp.status     === 'ok') forceShow.smtp     = false
    // Détecter désynchronisation IP
    if (data.network.data && !isPending(sanId.value).value) {
      const hasMismatch = data.network.data.interfaces.some(
        i => !i.useDHCP && i.currentIp && i.ipAddress && i.currentIp !== i.ipAddress,
      )
      if (hasMismatch) markPending(sanId.value, san.value?.label ?? sanId.value)
    }
  } catch (err: any) {
    // Cas exceptionnel (l'API est censée toujours retourner 200)
    const msg = err?.data?.message ?? err?.message ?? 'Erreur inattendue'
    const errObj = { code: 'UNKNOWN', message: msg }
    config.value = {
      sanId: sanId.value,
      scannedAt: Date.now(),
      sshStatus: 'error',
      hostname:  { data: null, status: 'error', error: errObj },
      dateTime:  { data: null, status: 'error', error: errObj },
      network:   { data: null, status: 'error', error: errObj },
      smtp:      { data: null, status: 'error', error: errObj },
    }
  } finally {
    loading.value = false
  }
}

async function retrySSH() {
  retrying.value = true
  try {
    await $fetch(`/api/admin/sans/${sanId.value}/reconnect`, { method: 'POST' })
    // Attendre 2s que le manager reconnecte
    await new Promise(r => setTimeout(r, 2_000))
    await reload()
  } catch {
    await reload()
  } finally {
    retrying.value = false
  }
}

// ── Changement d'adresse IP ───────────────────────────────────────────────────
const editingHost  = ref(false)
const savingHost   = ref(false)
const hostSaveError = ref<string | null>(null)
const editHostForm  = reactive({
  host: san.value?.host ?? '',
  port: san.value?.port ?? 22,
})

async function updateHost() {
  if (!editHostForm.host) return
  savingHost.value   = true
  hostSaveError.value = null
  try {
    await $fetch(`/api/admin/sans/${sanId.value}`, {
      method: 'PUT',
      body: { host: editHostForm.host, port: editHostForm.port },
    })
    // Rafraîchir les meta du SAN
    await refreshNuxtData(`/api/admin/sans/${sanId.value}`)
    editingHost.value = false
    // Le PUT force déjà une reconnexion côté serveur, attendre 2s puis recharger
    await new Promise(r => setTimeout(r, 2_000))
    await reload()
  } catch (err: any) {
    hostSaveError.value = tError(err as Parameters<typeof tError>[0])
  } finally {
    savingHost.value = false
  }
}

onMounted(reload)

watch(sanId, () => {
  void reload()
  editHostForm.host = san.value?.host ?? ''
  editHostForm.port = san.value?.port ?? 22
})

const pageTitle = computed(() => {
  if (clusterScope.value) {
    return t('admin.sysconfig.page.cluster_title', { name: clusterScope.value.name }) as string
  }
  if (activeTabKey.value === 'upgrade') {
    return t('admin.sysconfig.page.upgrade_title', { label: san.value?.label ?? sanId.value }) as string
  }
  return t('admin.sysconfig.page.title', { label: san.value?.label ?? sanId.value }) as string
})

const pageDescription = computed(() => {
  if (clusterScope.value) {
    return t('admin.sysconfig.page.cluster_description', {
      label: san.value?.label ?? sanId.value,
      host: san.value ? `${san.value.host}:${san.value.port}` : '—',
    }) as string
  }
  if (activeTabKey.value === 'upgrade') {
    return t('admin.sysconfig.page.upgrade_description') as string
  }
  return san.value ? `${san.value.host}:${san.value.port} · ${san.value.username}` : ''
})

const tabs = computed(() => [
  { key: 'network',  label: t('admin.sysconfig.page.tabs.network'),       icon: 'i-heroicons-globe-alt',       sectionStatus: config.value?.network.status },
  { key: 'datetime', label: t('admin.sysconfig.page.tabs.datetime'),      icon: 'i-heroicons-clock',            sectionStatus: config.value?.dateTime.status },
  { key: 'smtp',     label: t('admin.sysconfig.page.tabs.smtp'),          icon: 'i-heroicons-envelope',         sectionStatus: config.value?.smtp.status },
  { key: 'users',    label: t('admin.sysconfig.page.tabs.users'),         icon: 'i-heroicons-users',             sectionStatus: undefined },
  { key: 'upgrade',  label: t('admin.sysconfig.page.tabs.upgrade'),       icon: 'i-heroicons-arrow-up-circle',  sectionStatus: undefined },
  { key: 'system',   label: t('admin.sysconfig.page.tabs.system'),        icon: 'i-heroicons-computer-desktop', sectionStatus: config.value?.hostname.status },
  { key: 'terminal', label: t('admin.sysconfig.page.tabs.terminal'),      icon: 'i-heroicons-command-line',     sectionStatus: undefined },
])

const visibleTabs = computed(() => {
  if (isViewer.value) return tabs.value.filter(t => t.key !== 'terminal')
  return tabs.value
})

function resolveTabFromQuery(tab: unknown): SysConfigTabKey {
  const raw = Array.isArray(tab) ? tab[0] : tab
  if (raw === 'upgrade') return 'upgrade'
  if (raw === 'terminal' && !isViewer.value) return 'terminal'
  if (typeof raw === 'string' && isSysConfigTabKey(raw)) return raw
  return 'network'
}

const activeTabKey = ref<SysConfigTabKey>(resolveTabFromQuery(route.query.tab))

const upgradeSubTab = computed((): UpgradeSubTab | undefined => {
  const q = route.query.upgradeTab
  const raw = Array.isArray(q) ? q[0] : q
  return isUpgradeSubTab(raw) ? raw : undefined
})

const activeSubTabInUrl = ref<UpgradeSubTab>(upgradeSubTab.value ?? 'readiness')

const {
  clusterScope,
  isClusterMember,
  clusterRoleLabel,
  navigateToClusterNode,
  syncRouteQuery,
} = useSysconfigClusterScope(sanId, {
  activeTabKey,
  activeUpgradeSubTab: activeSubTabInUrl,
})

const tabScopeKind = computed(() => getSysconfigTabScope(activeTabKey.value))

const routeClusterUpgradeScope = computed(() => {
  if (!clusterScope.value) return null
  return {
    clusterId: clusterScope.value.id,
    clusterName: clusterScope.value.name,
    nodeIds: clusterScope.value.nodes.map(n => n.id),
  }
})

/** Switches main tab and updates `?tab=` / `?upgradeTab=` in the URL. */
function selectTab(key: string) {
  if (!isSysConfigTabKey(key)) return
  activeTabKey.value = key
  syncRouteQuery()
}

watch(upgradeSubTab, (tab) => {
  if (tab) activeSubTabInUrl.value = tab
}, { immediate: true })

function onUpgradeSubTabChange(tab: UpgradeSubTab) {
  activeSubTabInUrl.value = tab
  if (activeTabKey.value === 'upgrade') syncRouteQuery()
}

watch(visibleTabs, (list) => {
  const fallback = list[0]?.key
  if (!list.some(t => t.key === activeTabKey.value) && fallback && isSysConfigTabKey(fallback)) {
    activeTabKey.value = fallback
  }
}, { immediate: true })

watch(isViewer, (v) => {
  if (v && activeTabKey.value === 'terminal') activeTabKey.value = 'network'
}, { immediate: true })

watch(() => route.query.tab, (tab) => {
  activeTabKey.value = resolveTabFromQuery(tab)
})

const lastReadLabel = computed(() => {
  if (!loadedAt.value) return '—'
  const s = Math.round((Date.now() - loadedAt.value) / 1000)
  return s < 5
    ? (t('admin.sysconfig.page.relative_now') as string)
    : (t('admin.sysconfig.page.relative_ago', { seconds: s }) as string)
})

// ── Valeurs par défaut pour formulaires vides ─────────────────────────────────
const emptyNetwork  = { gateway: '', nameservers: ['', '', ''], searchDomain: '', interfaces: [] }
const emptySMTP     = { alertEmail: '', mailHub: '', authUser: '', useTLS: false, useSTARTTLS: false, authMethod: '' as const, fromOverride: true }
const emptyHostname = { hostname: '', domain: '', fqdn: '' }
</script>
