<template>
  <header
    class="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 shrink-0 gap-4"
  >
    <h1 class="text-sm font-semibold text-gray-700 dark:text-gray-200 shrink-0">
      {{ title }}
    </h1>

    <ContextSelectorBar
      :show-top-context-selector="nav.showTopContextSelector.value"
      :show-multi-selector="nav.showMultiSelector.value"
      @switch="switchContext"
    />

    <div class="flex items-center gap-4 shrink-0 ml-auto">
      <RefreshBadge :last-refresh="overviewStore.lastRefresh" />

      <template v-if="!nav.showMultiSelector.value">
        <NuxtLink
          v-if="sshStore.isUnconfigured"
          to="/admin"
          class="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-2"
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

      <UDropdownMenu :items="userMenuItems" :content="{ side: 'bottom', align: 'end' }">
        <button
          class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          type="button"
          :aria-label="t('user_menu.open')"
        >
          <div class="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-950 border border-primary-200 dark:border-primary-800 flex items-center justify-center shrink-0">
            <span class="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase select-none leading-none">
              {{ authStore.user?.username?.charAt(0) ?? '?' }}
            </span>
          </div>
          <span class="text-sm text-gray-700 dark:text-gray-200 font-medium hidden sm:block">{{ authStore.user?.username }}</span>
          <UIcon name="i-heroicons-chevron-down" class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
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
            <ThemeSwitcher mode="menu" />
            <LanguageSwitcher mode="menu" />
          </div>
        </template>
      </UDropdownMenu>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ALL_SANS_ID } from '~/composables/useSelectedSan'
import { AUTH_STOP_POLLING_EVENT, registerPagePoller, unregisterPagePoller } from '~/utils/app-polling'
import { isPollingPaused } from '~/utils/polling-coordinator'

const route = useRoute()
const sshStore = useSSHStore()
const overviewStore = useOverviewStore()
const authStore = useAuthStore()
const sanSelector = useSelectedSan()
const nav = useNavigationContext()
const { t } = useEsosI18n()

const hwStore = useHardwareStore()
const statsStore = useStatsStore()
const driftDetection = useNetworkDriftDetection()

let statusInterval: ReturnType<typeof setInterval> | null = null
let headerPollerRegistered = false

function clearHeaderPolling() {
  driftDetection.stop()
  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }
}

function startHeaderPolling() {
  if (!authStore.isAuthenticated) return
  const role = authStore.user?.role
  if (role === 'operator' || role === 'admin') {
    driftDetection.start(60_000)
  }
  if (!headerPollerRegistered) {
    headerPollerRegistered = true
    registerPagePoller('header-selection', () => {
      clearHeaderPolling()
      statusInterval = setInterval(() => {
        if (!authStore.isAuthenticated || isPollingPaused()) return
        void sanSelector.fetchSans()
      }, 60_000)
    }, clearHeaderPolling)
  }
  void sanSelector.fetchSans()
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
  unregisterPagePoller('header-selection')
})

async function refreshStoresForContext() {
  overviewStore.invalidate()
  hwStore.$patch({ data: null, alerts: [] })
  statsStore.$patch({ sessions: [], devices: [] })
  await Promise.all([
    overviewStore.fetch(),
    hwStore.fetch(),
    statsStore.fetchAll(),
  ])
}

async function switchContext(id: string) {
  if (id === ALL_SANS_ID) {
    sanSelector.selectAll()
  } else {
    sanSelector.select(id)
  }

  const target = nav.targetForSwitch(id)
  if (target) {
    await navigateTo(target)
    return
  }

  await refreshStoresForContext()
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
