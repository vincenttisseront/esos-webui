<template>
  <header
    class="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 shrink-0 gap-4"
  >
    <h1 class="text-sm font-semibold text-gray-700 dark:text-gray-200 shrink-0">
      {{ title }}
    </h1>

    <!-- Sélecteur contexte global (SANs standalone + clusters) -->
    <div v-if="sanSelector.isMultiSan.value" class="flex items-center gap-1.5 overflow-x-auto">

      <!-- Bouton "Tous" (mode agrégé, visible si plusieurs SANs standalone) -->
      <template v-if="sanSelector.standaloneSans.value.length > 1">
        <button
          class="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors shrink-0"
          :class="sanSelector.isAll.value
            ? 'bg-primary-600 text-white border-primary-600'
            : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400 hover:text-primary-600'"
          @click="switchSan(ALL_SANS_ID)"
        >
          <UIcon name="i-heroicons-server-stack" class="w-3 h-3" />
          {{ t('common.all') }}
        </button>
        <span class="h-4 w-px bg-gray-200 shrink-0" />
      </template>

      <!-- SANs standalone -->
      <button
        v-for="san in sanSelector.standaloneSans.value"
        :key="san.id"
        class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors shrink-0"
        :class="!sanSelector.isAll.value && sanSelector.selected.value?.id === san.id
          ? 'bg-primary-600 text-white border-primary-600'
          : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400 hover:text-primary-600'"
        @click="switchSan(san.id)"
      >
        <span
          class="w-1.5 h-1.5 rounded-full shrink-0"
          :class="{
            'bg-green-400': sanSelector.sshStatuses.value[san.id] === 'connected',
            'bg-orange-400 animate-pulse': sanSelector.sshStatuses.value[san.id] === 'reconnecting',
            'bg-red-500': sanSelector.sshStatuses.value[san.id] === 'error',
            'bg-gray-400': !sanSelector.sshStatuses.value[san.id] || sanSelector.sshStatuses.value[san.id] === 'connecting',
          }"
        />
        <span class="font-mono">{{ san.label }}</span>
      </button>

      <!-- Séparateur si les deux groupes sont présents -->
      <template v-if="sanSelector.standaloneSans.value.length > 0 && sanSelector.clusters.value.length > 0">
        <span class="h-4 w-px bg-gray-200 shrink-0" />
      </template>

      <!-- Clusters -->
      <button
        v-for="cluster in sanSelector.clusters.value"
        :key="cluster.id"
        class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors shrink-0"
        :class="sanSelector.selectedCluster.value?.id === cluster.id
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'"
        @click="switchSan(cluster.id)"
      >
        <UIcon name="i-heroicons-server-stack" class="w-3 h-3 shrink-0" />
        <span>{{ cluster.name }}</span>
        <!-- Badge mode cluster -->
        <span
          class="ml-0.5 text-[9px] px-1 py-0.5 rounded font-semibold uppercase tracking-wide"
          :class="sanSelector.selectedCluster.value?.id === cluster.id
            ? 'bg-indigo-500 text-indigo-100'
            : 'bg-gray-100 text-gray-500'"
        >HA</span>
      </button>
    </div>

    <div class="flex items-center gap-4 shrink-0 ml-auto">
      <RefreshBadge :last-refresh="overviewStore.lastRefresh" />

      <template v-if="!sanSelector.isMultiSan.value">
        <NuxtLink
          v-if="sshStore.isUnconfigured"
          to="/admin"
          class="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2"
        >
          <span class="w-2 h-2 rounded-full bg-gray-400" />
          {{ t(sshStore.statusKey) }}
        </NuxtLink>
        <div
          v-else
          class="flex items-center gap-1.5 text-xs font-medium"
          :class="badgeTextClass"
        >
          <span
            class="w-2 h-2 rounded-full"
            :class="{
              'bg-green-500': sshStore.isReady,
              'bg-orange-400 animate-pulse': sshStore.isReconnecting,
              'bg-red-500': sshStore.isError,
              'bg-gray-400': sshStore.status === 'connecting',
            }"
          />
          {{ t(sshStore.statusKey) }}
        </div>
      </template>

      <UButton
        icon="i-heroicons-arrow-path"
        size="xs"
        color="gray"
        variant="ghost"
        :loading="overviewStore.loading"
        @click="overviewStore.fetch()"
      />

      <!-- Menu utilisateur -->
      <UDropdownMenu :items="userMenuItems" :content="{ side: 'bottom', align: 'end' }">
        <button
          class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors"
          type="button"
          :aria-label="t('user_menu.open')"
        >
          <div class="w-7 h-7 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center shrink-0">
            <span class="text-xs font-bold text-primary-600 uppercase select-none leading-none">
              {{ authStore.user?.username?.charAt(0) ?? '?' }}
            </span>
          </div>
          <span class="text-sm text-gray-700 font-medium hidden sm:block">{{ authStore.user?.username }}</span>
          <UIcon name="i-heroicons-chevron-down" class="w-3.5 h-3.5 text-gray-400" />
        </button>

        <template #content-top>
          <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {{ authStore.user?.username ?? '—' }}
            </p>
            <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              <UBadge size="xs" variant="subtle" :color="authStore.user?.role === 'admin' ? 'blue' : 'gray'">
                {{ authStore.user?.role ?? '—' }}
              </UBadge>
              <UBadge size="xs" variant="subtle" color="gray">
                {{ authSourceLabel }}
              </UBadge>
            </div>
          </div>
        </template>

        <template #content-bottom>
          <div class="border-t border-gray-100 dark:border-gray-800">
            <LanguageSwitcher mode="menu" />
          </div>
        </template>
      </UDropdownMenu>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ALL_SANS_ID } from '~/composables/useSelectedSan'
import { AUTH_STOP_POLLING_EVENT } from '~/utils/app-polling'

const route = useRoute()
const sshStore = useSSHStore()
const overviewStore = useOverviewStore()
const authStore = useAuthStore()
const sanSelector = useSelectedSan()
const { t } = useEsosI18n()

const hwStore = useHardwareStore()
const statsStore = useStatsStore()
const driftDetection = useNetworkDriftDetection()

let statusInterval: ReturnType<typeof setInterval> | null = null

function clearHeaderPolling() {
  driftDetection.stop()
  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }
}

function startHeaderPolling() {
  if (!authStore.isAuthenticated) return
  clearHeaderPolling()
  const role = authStore.user?.role
  if (role === 'operator' || role === 'admin') {
    driftDetection.start(60_000)
  }
  statusInterval = setInterval(() => {
    if (authStore.isAuthenticated) sanSelector.fetchSans()
  }, 15_000)
}

useEventBus<void>(AUTH_STOP_POLLING_EVENT).on(clearHeaderPolling)

watch(
  () => authStore.isAuthenticated,
  (ok) => {
    if (ok) startHeaderPolling()
    else clearHeaderPolling()
  },
)

onMounted(async () => {
  if (!authStore.isAuthenticated) return
  if (!sanSelector.sans.value.length) {
    await sanSelector.fetchSans()
  }
  startHeaderPolling()
})

onBeforeUnmount(() => {
  clearHeaderPolling()
})

async function switchSan(id: string) {
  if (id === ALL_SANS_ID) {
    sanSelector.selectAll()
  } else {
    sanSelector.select(id)
  }
  // Reset stale data immediately
  overviewStore.invalidate()
  hwStore.$patch({ data: null, alerts: [] })
  statsStore.$patch({ sessions: [], devices: [] })
  // Refetch with new SAN context
  await Promise.all([
    overviewStore.fetch(),
    hwStore.fetch(),
    statsStore.fetchAll(),
  ])
}

const authSourceLabel = computed(() => {
  const source = authStore.user?.authSource ?? 'local'
  return t(`profile.account.auth_sources.${source}`)
})

const userMenuItems = computed(() => [[
  {
    label: t('user_menu.profile'),
    icon: 'i-heroicons-user-circle',
    to: '/profile',
  },
], [
  {
    label: t('user_menu.logout'),
    icon: 'i-heroicons-arrow-right-on-rectangle',
    color: 'error',
    onSelect: () => authStore.logout(),
  },
]])

const titleKeys: Record<string, string> = {
  '/':         'nav.page_titles.dashboard',
  '/targets':  'nav.page_titles.targets',
  '/devices':  'nav.page_titles.devices',
  '/sessions': 'nav.page_titles.sessions',
  '/terminal': 'nav.page_titles.terminal',
}
const title = computed(() => {
  if (route.path.startsWith('/targets/')) return t('nav.page_titles.target_detail')
  const key = titleKeys[route.path]
  return key ? t(key) : t('app.name')
})

const badgeTextClass = computed(() => {
  if (sshStore.isReady) return 'text-green-600 dark:text-green-400'
  if (sshStore.isError) return 'text-red-600 dark:text-red-400'
  if (sshStore.isUnconfigured) return 'text-gray-500 dark:text-gray-400'
  return 'text-orange-500 dark:text-orange-400'
})
</script>
