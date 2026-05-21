<template>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 pb-px">
      <button
        v-for="tab in visibleSubTabs"
        :key="tab.value"
        type="button"
        class="px-3 py-2 text-sm font-medium rounded-t-md transition-colors"
        :class="activeSubTab === tab.value
          ? 'bg-white dark:bg-gray-900 text-primary-600 dark:text-primary-400 border border-b-0 border-gray-200 dark:border-gray-700 -mb-px'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'"
        @click="setSubTab(tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-show="activeSubTab === 'readiness'">
      <UpgradeReadinessPanel :scope-label="scopeLabel" @refresh="(force) => refreshReadiness(force)" />
    </div>

    <div v-show="activeSubTab === 'package'">
      <UpgradePackageUpload
        :san-id="packageSanId"
        :blocked="packageBlocked"
        :version-up-to-date="versionUpToDate"
      />
    </div>

    <div v-show="activeSubTab === 'plan'">
      <UpgradePlanViewer :can-generate="!!readinessQueryParams" @generate="generatePlan" />
    </div>

    <div v-show="activeSubTab === 'execute'">
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
import { isUpgradeSubTab, useUpgradeScope, type UpgradeSubTab } from '~/composables/useUpgradeScope'

const props = defineProps<{
  sanId: string
  initialSubTab?: UpgradeSubTab
  routeClusterScope?: {
    clusterId: string
    clusterName: string
    nodeIds: string[]
  } | null
}>()

const emit = defineEmits<{
  (e: 'sub-tab-change', tab: UpgradeSubTab): void
}>()

const { t } = useEsosI18n()
const authStore = useAuthStore()
const upgradeStore = useUpgradeStore()
const routeClusterScope = computed(() => props.routeClusterScope ?? null)

const { scopeLabel, readinessQueryParams, versionStore, sanSelector } = useUpgradeScope(
  computed(() => props.sanId),
  routeClusterScope,
)

const activeSubTab = ref<UpgradeSubTab>(
  props.initialSubTab && isUpgradeSubTab(props.initialSubTab) ? props.initialSubTab : 'readiness',
)

watch(
  () => props.initialSubTab,
  (tab) => {
    if (tab && isUpgradeSubTab(tab)) activeSubTab.value = tab
  },
)

const visibleSubTabs = computed(() => {
  const items = [
    { label: t('admin.upgrade.tabs.readiness'), value: 'readiness' as const },
  ]
  if (authStore.user?.role === 'admin') {
    items.push({ label: t('admin.upgrade.tabs.package'), value: 'package' as const })
  }
  items.push(
    { label: t('admin.upgrade.tabs.plan'), value: 'plan' as const },
    { label: t('admin.upgrade.tabs.execute'), value: 'execute' as const },
  )
  return items
})

const packageSanId = computed(() => props.sanId)

const versionAvailability = computed(() => upgradeStore.readiness?.versionAvailability ?? null)

const versionUpToDate = computed(
  () => versionAvailability.value?.overall === 'up-to-date',
)

const packageBlocked = computed(() => {
  if (sanSelector.isEffectiveReadOnly.value) return true
  const r = upgradeStore.readiness
  if (r?.overall === 'blocked') return true
  return versionUpToDate.value
})

function setSubTab(tab: UpgradeSubTab) {
  activeSubTab.value = tab
  emit('sub-tab-change', tab)
}

function refreshReadiness(force = false) {
  const p = readinessQueryParams.value
  if (p) void upgradeStore.fetchReadiness(p, { force })
}

function generatePlan() {
  const p = readinessQueryParams.value
  if (!p) return
  void upgradeStore.generatePlan({
    ...p,
    targetVersion:
      versionAvailability.value?.latestStable?.version
      ?? versionStore.report?.latestStable?.name,
    packageStagingId: upgradeStore.packageStatus?.stagingId,
  })
}

function bootstrap() {
  refreshReadiness()
  if (packageSanId.value) void upgradeStore.fetchPackageStatus(packageSanId.value)
}

onMounted(bootstrap)

watch(
  () => [sanSelector.selectedId.value, sanSelector.effective.value?.id, props.sanId],
  () => bootstrap(),
)
</script>
