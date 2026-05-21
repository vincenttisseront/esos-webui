<template>
  <aside class="w-56 bg-gray-900 text-white flex flex-col shrink-0 hidden md:flex">
    <!-- Logo -->
    <div class="px-4 py-5 border-b border-gray-700 flex items-center gap-3">
      <img src="/logo/logo-esos-icon.svg" alt="ESOS" class="w-8 h-8 shrink-0" />
      <div>
        <span class="text-lg font-bold tracking-wide leading-none">ESOS</span>
        <span class="text-xs text-gray-400 block leading-tight">{{ t('app.tagline') }}</span>
      </div>
    </div>

    <nav class="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
      <!-- Sections classiques -->
      <div v-for="section in navSections" :key="section.label">
        <p class="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500 select-none">
          {{ section.label }}
        </p>

        <div class="space-y-0.5">
          <NuxtLink
            v-for="item in section.items"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-gray-300 hover:bg-gray-800 hover:text-white"
            active-class="bg-gray-800 text-white"
            exact-active-class="bg-gray-800 text-white"
          >
            <UIcon :name="item.icon" class="w-4 h-4 shrink-0" />
            <span class="flex-1">{{ item.label }}</span>
            <AlertsBadge v-if="item.to === '/hardware'" />
            <UBadge
              v-if="item.to === '/cluster' && clusterStore.isDegraded"
              label="!"
              color="red"
              size="xs"
            />
          </NuxtLink>
        </div>
      </div>

      <!-- Section Système : Administration + sous-menu -->
      <div>
        <p class="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500 select-none">
          {{ t('nav.sections.system') }}
        </p>

        <div class="space-y-0.5">
          <!-- Item Administration (parent) -->
          <NuxtLink
            to="/admin"
            class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-gray-300 hover:bg-gray-800 hover:text-white"
            active-class="bg-gray-800 text-white"
          >
            <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 shrink-0" />
            <span class="flex-1">{{ t('nav.items.administration') }}</span>
          </NuxtLink>

          <!-- Sous-items (toujours visibles, indentés) -->
          <NuxtLink
            to="/admin/sans"
            class="flex items-center gap-3 pl-8 pr-3 py-1.5 rounded-md text-xs transition-colors text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            active-class="bg-gray-800 text-gray-100"
            exact-active-class="bg-gray-800 text-gray-100"
          >
            <UIcon name="i-heroicons-server-stack" class="w-3.5 h-3.5 shrink-0" />
            <span class="flex-1">{{ t('nav.items.sans') }}</span>
          </NuxtLink>

          <NuxtLink
            to="/admin/cluster"
            class="flex items-center gap-3 pl-12 pr-3 py-1.5 rounded-md text-xs transition-colors text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            active-class="bg-gray-800 text-gray-100"
            exact-active-class="bg-gray-800 text-gray-100"
          >
            <UIcon name="i-heroicons-rectangle-group" class="w-3.5 h-3.5 shrink-0" />
            <span class="flex-1">{{ t('nav.items.cluster_ha') }}</span>
            <UBadge
              v-if="!clusterStore.isConfigured && clusterStore.overview"
              label="!"
              color="blue"
              size="xs"
            />
          </NuxtLink>

          <NuxtLink
            v-if="authStore.user?.role === 'admin'"
            to="/admin/users"
            class="flex items-center gap-3 pl-8 pr-3 py-1.5 rounded-md text-xs transition-colors text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            active-class="bg-gray-800 text-gray-100"
            exact-active-class="bg-gray-800 text-gray-100"
          >
            <UIcon name="i-heroicons-users" class="w-3.5 h-3.5 shrink-0" />
            <span class="flex-1">{{ t('nav.items.users') }}</span>
          </NuxtLink>

          <NuxtLink
            to="/admin/esos-version"
            class="flex items-center gap-3 pl-8 pr-3 py-1.5 rounded-md text-xs transition-colors text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            active-class="bg-gray-800 text-gray-100"
            exact-active-class="bg-gray-800 text-gray-100"
          >
            <UIcon name="i-heroicons-tag" class="w-3.5 h-3.5 shrink-0" />
            <span class="flex-1">{{ t('nav.items.esos_version') }}</span>
            <UBadge
              v-if="esosVersionStore.report?.diff === 'major'"
              label="!"
              color="red"
              size="xs"
            />
            <UBadge
              v-else-if="['minor', 'patch'].includes(esosVersionStore.report?.diff ?? '')"
              label="↑"
              color="amber"
              size="xs"
            />
          </NuxtLink>

          <NuxtLink
            v-if="authStore.user?.role !== 'viewer'"
            to="/admin/dependencies"
            class="flex items-center gap-3 pl-8 pr-3 py-1.5 rounded-md text-xs transition-colors text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            active-class="bg-gray-800 text-gray-100"
            exact-active-class="bg-gray-800 text-gray-100"
          >
            <UIcon name="i-heroicons-cube" class="w-3.5 h-3.5 shrink-0" />
            <span class="flex-1">{{ t('nav.items.dependencies') }}</span>
            <UBadge
              v-if="depsStore.majorCount > 0"
              :label="String(depsStore.majorCount)"
              color="red"
              size="xs"
            />
          </NuxtLink>

          <NuxtLink
            v-if="authStore.user?.role === 'admin'"
            to="/admin/app-version"
            class="flex items-center gap-3 pl-8 pr-3 py-1.5 rounded-md text-xs transition-colors text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            active-class="bg-gray-800 text-gray-100"
            exact-active-class="bg-gray-800 text-gray-100"
          >
            <UIcon name="i-heroicons-cube-transparent" class="w-3.5 h-3.5 shrink-0" />
            <span class="flex-1">{{ t('nav.items.webui_version') }}</span>
          </NuxtLink>

        </div>
      </div>
    </nav>

    <ClientOnly>
      <div v-if="appVersionStore.version" class="px-4 pb-1 pt-0">
        <span class="text-[9px] text-gray-600 font-mono select-none">
          {{ appVersionStore.label }}<template v-if="appVersionStore.shortCommit"> · {{ appVersionStore.shortCommit }}</template>
        </span>
      </div>
    </ClientOnly>

    <div class="px-4 py-3 border-t border-gray-700">
      <NuxtLink
        to="/profile"
        class="flex items-center gap-2.5 group"
      >
        <div class="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0 group-hover:bg-gray-600 transition-colors">
          <span class="text-xs font-bold text-gray-300 uppercase leading-none select-none">
            {{ authStore.user?.username?.charAt(0) ?? '?' }}
          </span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-medium text-gray-300 truncate group-hover:text-white transition-colors">{{ authStore.user?.username ?? '—' }}</p>
          <p class="text-[10px] text-gray-500 truncate">{{ authStore.user?.role }}</p>
        </div>
        <UIcon name="i-heroicons-cog-6-tooth" class="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" />
      </NuxtLink>
    </div>
  </aside>
</template>

<script setup lang="ts">
const depsStore        = useDepsStore()
const esosVersionStore = useESOSVersionStore()
const clusterStore     = useClusterStore()
const authStore        = useAuthStore()
const appVersionStore  = useAppVersionStore()
const { t }            = useEsosI18n()

onMounted(() => {
  if (!esosVersionStore.report) esosVersionStore.fetch()
})

// Charger les dépendances uniquement quand le rôle est connu et non-viewer
watchEffect(() => {
  if (!depsStore.report && authStore.user && authStore.user.role !== 'viewer') {
    depsStore.fetch()
  }
})

const navSections = computed(() => [
  {
    label: t('nav.sections.overview'),
    items: [
      { to: '/', icon: 'i-heroicons-home', label: t('nav.items.dashboard') },
    ],
  },
  {
    label: t('nav.sections.storage'),
    items: [
      { to: '/targets',  icon: 'i-heroicons-server-stack',   label: t('nav.items.targets')  },
      { to: '/devices',  icon: 'i-heroicons-circle-stack',   label: t('nav.items.devices')  },
      { to: '/sessions', icon: 'i-heroicons-link',           label: t('nav.items.sessions') },
    ],
  },
  {
    label: t('nav.sections.monitoring'),
    items: [
      { to: '/stats',     icon: 'i-heroicons-chart-bar',                label: t('nav.items.stats')      },
      { to: '/history',   icon: 'i-heroicons-chart-bar-square',         label: t('nav.items.history')    },
      { to: '/hardware',  icon: 'i-heroicons-cpu-chip',                 label: t('nav.items.hardware')   },
      { to: '/topology',  icon: 'i-heroicons-share',                    label: t('nav.items.topology')   },
      { to: '/cluster',   icon: 'i-heroicons-server-stack',             label: t('nav.items.cluster_ha') },
      { to: '/inventory', icon: 'i-heroicons-clipboard-document-list',  label: t('nav.items.inventory')  },
    ],
  },
])
</script>
