<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {{ t('nav.items.esos_version') }}
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {{ scopeLabel }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="versionStore.report" class="text-xs text-gray-400">
          {{ timeAgo }}
        </span>
        <UButton
          v-if="activeTab === 'version'"
          icon="i-heroicons-arrow-path"
          size="sm"
          color="gray"
          variant="soft"
          :loading="versionStore.loading"
          @click="versionStore.fetch(true)"
        >
          Actualiser
        </UButton>
      </div>
    </header>

    <div class="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 pb-px">
      <button
        v-for="tab in tabItems"
        :key="tab.value"
        type="button"
        class="px-3 py-2 text-sm font-medium rounded-t-md transition-colors"
        :class="activeTab === tab.value
          ? 'bg-white dark:bg-gray-900 text-primary-600 dark:text-primary-400 border border-b-0 border-gray-200 dark:border-gray-700 -mb-px'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'"
        @click="activeTab = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-show="activeTab === 'version'">
      <div v-if="versionStore.loading && !versionStore.report" class="flex items-center justify-center py-20 text-gray-400 gap-3">
        <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin" />
      </div>
      <UAlert
        v-else-if="versionStore.error"
        color="red"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :title="versionStore.error"
      />
      <template v-else-if="versionStore.report">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <VersionInstalledVersionCard :installed="versionStore.report.installed" />
          <VersionCompareCard :report="versionStore.report" :diff="versionStore.report.diff" />
        </div>
        <VersionHistoryTable
          class="mt-4"
          :tags="versionStore.report.allTags"
          :installed-version="versionStore.report.installed.version"
        />
      </template>
    </div>

    <div v-show="activeTab === 'readiness'">
      <UpgradeReadinessPanel :scope-label="scopeLabel" @refresh="refreshReadiness" />
    </div>

    <div v-show="activeTab === 'package'">
      <UpgradePackageUpload :san-id="effectiveSanId" :blocked="packageBlocked" />
    </div>

    <div v-show="activeTab === 'plan'">
      <UpgradePlanViewer :can-generate="!!planScope" @generate="generatePlan" />
    </div>

    <div v-show="activeTab === 'execute'">
      <UCard>
        <template #header>
          <p class="font-semibold text-gray-800 dark:text-gray-200">
            {{ t('admin.upgrade.execute.title') }}
          </p>
        </template>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t('admin.upgrade.execute.coming_soon') }}
        </p>
        <a
          href="https://github.com/quantum/esos/wiki/13_Upgrading"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block mt-4 text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          {{ t('admin.upgrade.wiki_link') }}
        </a>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ ssr: false })

const { t } = useEsosI18n()
const versionStore = useESOSVersionStore()
const upgradeStore = useUpgradeStore()
const sanSelector = useSelectedSan()
const authStore = useAuthStore()

const activeTab = ref('version')

const tabItems = computed(() => {
  const items = [
    { label: t('admin.upgrade.tabs.version'), value: 'version' },
    { label: t('admin.upgrade.tabs.readiness'), value: 'readiness' },
  ]
  if (authStore.user?.role === 'admin') {
    items.push({ label: t('admin.upgrade.tabs.package'), value: 'package' })
  }
  items.push(
    { label: t('admin.upgrade.tabs.plan'), value: 'plan' },
    { label: t('admin.upgrade.tabs.execute'), value: 'execute' },
  )
  return items
})

const scopeLabel = computed(() => {
  const ctx = sanSelector.context.value
  if (ctx?.type === 'cluster') return `Cluster: ${ctx.cluster.name}`
  const san = sanSelector.effective.value
  return san ? `SAN: ${san.label}` : '—'
})

const effectiveSanId = computed(() => sanSelector.effective.value?.id ?? '')

const packageBlocked = computed(() => {
  if (sanSelector.isEffectiveReadOnly.value) return true
  const r = upgradeStore.readiness
  return r?.overall === 'blocked'
})

const planScope = computed(() => readinessQueryParams())

function readinessQueryParams(): { sanId?: string; clusterId?: string; nodeIds?: string[] } | null {
  const ctx = sanSelector.context.value
  if (ctx?.type === 'cluster') {
    const ids = ctx.cluster.nodes.map(n => n.id)
    if (!ids.length) return null
    return { clusterId: ctx.cluster.id, nodeIds: ids }
  }
  const id = sanSelector.effective.value?.id
  if (!id) return null
  return { sanId: id }
}

function refreshReadiness() {
  const p = readinessQueryParams()
  if (p) void upgradeStore.fetchReadiness(p)
}

function generatePlan() {
  const p = readinessQueryParams()
  if (!p) return
  void upgradeStore.generatePlan({
    ...p,
    targetVersion: versionStore.report?.latestStable?.name,
    packageStagingId: upgradeStore.packageStatus?.stagingId,
  })
}

const timeAgo = computed(() => {
  if (!versionStore.report) return ''
  const diffSec = Math.floor((Date.now() - versionStore.report.scannedAt) / 1000)
  if (diffSec < 60) return `il y a ${diffSec}s`
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)}min`
  return `il y a ${Math.floor(diffSec / 3600)}h`
})

onMounted(() => {
  void versionStore.fetch()
  const p = readinessQueryParams()
  if (p) void upgradeStore.fetchReadiness(p)
  if (effectiveSanId.value) void upgradeStore.fetchPackageStatus(effectiveSanId.value)
})

watch(
  () => [sanSelector.selectedId.value, sanSelector.effective.value?.id],
  () => {
    refreshReadiness()
    if (effectiveSanId.value) void upgradeStore.fetchPackageStatus(effectiveSanId.value)
  },
)
</script>
