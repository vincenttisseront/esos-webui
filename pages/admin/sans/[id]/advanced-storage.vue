<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <UButton
          to="/admin/sans"
          icon="i-heroicons-arrow-left"
          variant="ghost"
          size="sm"
          color="gray"
        />
        <UIcon name="i-heroicons-circle-stack" class="w-6 h-6 text-indigo-500" />
        <div>
          <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {{ t('advanced_storage.page.title') }}
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('advanced_storage.page.subtitle', { label: san?.label ?? sanId }) }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="overview" class="text-xs text-gray-600 dark:text-gray-400">
          {{ t('advanced_storage.page.last_scan', { time: scanTime }) }}
        </span>
        <UButton
          size="sm"
          color="gray"
          variant="ghost"
          icon="i-heroicons-arrow-path"
          :loading="loading || clusterOverviewLoading"
          @click="refreshAll(true)"
        >
          {{ t('advanced_storage.page.refresh') }}
        </UButton>
      </div>
    </div>

    <StorageReadOnlyBanner :read-only="isReadOnly" />

    <UAlert
      color="blue"
      icon="i-heroicons-information-circle"
      variant="soft"
      :description="t('advanced_storage.page.read_only_hint')"
    />

    <UAlert
      v-if="clusterScopeId && !isClusterMember"
      color="amber"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :title="t('advanced_storage.cluster.node_mismatch_title')"
      :description="t('advanced_storage.cluster.node_mismatch_desc')"
    />

    <AdvancedStorageClusterPanel
      v-if="clusterScopeId"
      :cluster-name="clusterName"
      :current-san-id="sanId"
      :overview="clusterOverview"
      :loading="clusterOverviewLoading"
      :cluster-role-label="clusterRoleLabel"
      @select-node="navigateToClusterNode"
    />

    <div v-if="loading && !overview" class="text-center py-16 text-gray-500 dark:text-gray-400">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin w-8 h-8 mb-2 mx-auto" />
      <p>{{ t('advanced_storage.page.scan_in_progress') }}</p>
    </div>

    <UAlert v-if="error" color="red" icon="i-heroicons-x-circle" variant="soft" :title="error" />

    <template v-if="overview">
      <AdvancedStorageDeprecatedBanner :items="overview.deprecated" />

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <AdvancedStorageSummaryCard
          v-for="tech in activeTechSummaries"
          :key="tech.id"
          :tech="tech"
          @select="scrollToTech"
        />
      </div>

      <AdvancedStorageTechPanel
        id="panel-drbd"
        panel-id="panel-drbd"
        :title="t('advanced_storage.tech.drbd')"
        :presence="techPresence('drbd')"
        :enabled="overview.drbd.enabled"
        :running="overview.drbd.running"
        show-service
      >
        <div v-if="!overview.drbd.resources.length" class="text-sm text-gray-500">
          {{ t('advanced_storage.panels.no_resources') }}
        </div>
        <div v-else class="space-y-1 divide-y divide-gray-100 dark:divide-gray-800">
          <DRBDResourceRow
            v-for="res in overview.drbd.resources"
            :key="res.name"
            :res="res"
          />
        </div>
      </AdvancedStorageTechPanel>

      <AdvancedStorageTechPanel
        id="panel-multipath"
        panel-id="panel-multipath"
        :title="t('advanced_storage.tech.multipath')"
        :presence="techPresence('multipath')"
        :enabled="overview.rc.multipathd"
        show-service
      >
        <p class="text-xs font-medium text-gray-500 mb-2">{{ t('advanced_storage.panels.maps') }}</p>
        <pre
          v-if="overview.multipath.maps.length"
          class="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto"
        >{{ multipathText }}</pre>
        <p v-else class="text-sm text-gray-500">{{ t('advanced_storage.panels.no_resources') }}</p>
      </AdvancedStorageTechPanel>

      <AdvancedStorageTechPanel
        id="panel-zfs"
        panel-id="panel-zfs"
        :title="t('advanced_storage.tech.zfs')"
        :presence="techPresence('zfs')"
      >
        <div v-if="overview.zfs.pools.length" class="space-y-2 text-sm">
          <p class="text-xs font-medium text-gray-500">{{ t('advanced_storage.panels.pools') }}</p>
          <ul class="font-mono text-xs space-y-1">
            <li v-for="p in overview.zfs.pools" :key="p.name">{{ p.name }} — {{ p.health }}</li>
          </ul>
        </div>
        <p v-else class="text-sm text-gray-500">{{ t('advanced_storage.panels.no_resources') }}</p>
      </AdvancedStorageTechPanel>

      <AdvancedStorageTechPanel
        id="panel-mhvtl"
        panel-id="panel-mhvtl"
        :title="t('advanced_storage.tech.mhvtl')"
        :presence="techPresence('mhvtl')"
        :enabled="overview.rc.mhvtl"
        show-service
      >
        <ul v-if="overview.mhvtl.devices.length" class="text-sm font-mono space-y-1">
          <li v-for="d in overview.mhvtl.devices" :key="d.name">{{ d.path ?? d.name }}</li>
        </ul>
        <p v-else class="text-sm text-gray-500">{{ t('advanced_storage.panels.no_resources') }}</p>
      </AdvancedStorageTechPanel>

      <AdvancedStorageTechPanel
        id="panel-bcache"
        panel-id="panel-bcache"
        :title="t('advanced_storage.tech.bcache')"
        :presence="techPresence('bcache')"
      >
        <ul v-if="overview.bcache.devices.length" class="text-sm font-mono space-y-1">
          <li v-for="d in overview.bcache.devices" :key="d.name">{{ d.backingPath ?? d.name }} {{ d.state ? `(${d.state})` : '' }}</li>
        </ul>
        <p v-else class="text-sm text-gray-500">{{ t('advanced_storage.panels.no_resources') }}</p>
      </AdvancedStorageTechPanel>

      <AdvancedStorageTechPanel
        id="panel-dm_cache"
        panel-id="panel-dm_cache"
        :title="t('advanced_storage.tech.dm_cache')"
        :presence="techPresence('dm_cache')"
        :enabled="overview.rc.dmcache"
        show-service
      >
        <ul v-if="overview.dmCache.targets.length" class="text-sm font-mono space-y-1">
          <li v-for="tgt in overview.dmCache.targets" :key="tgt.name">
            {{ tgt.name }} {{ tgt.cacheMode ? `(${tgt.cacheMode})` : '' }}
          </li>
        </ul>
        <p v-else class="text-sm text-gray-500">{{ t('advanced_storage.panels.no_resources') }}</p>
      </AdvancedStorageTechPanel>

      <AdvancedStorageTechPanel
        id="panel-lvm_cache"
        panel-id="panel-lvm_cache"
        :title="t('advanced_storage.tech.lvm_cache')"
        :presence="techPresence('lvm_cache')"
      >
        <ul v-if="overview.lvmCache.volumes.length" class="text-sm font-mono space-y-1">
          <li v-for="v in overview.lvmCache.volumes" :key="v.lv">{{ v.lv }} — {{ v.segtype }}</li>
        </ul>
        <p v-else class="text-sm text-gray-500">{{ t('advanced_storage.panels.no_resources') }}</p>
      </AdvancedStorageTechPanel>

      <AdvancedStorageTechPanel
        id="panel-ceph_rbd"
        panel-id="panel-ceph_rbd"
        :title="t('advanced_storage.tech.ceph_rbd')"
        :presence="techPresence('ceph_rbd')"
        :enabled="overview.rc.rbdmap"
        show-service
      >
        <ul v-if="overview.cephRbd.mappings.length" class="text-sm font-mono space-y-1">
          <li v-for="m in overview.cephRbd.mappings" :key="m.device">
            {{ m.device }} ← {{ m.pool }}/{{ m.image }}
          </li>
        </ul>
        <p v-else class="text-sm text-gray-500">{{ t('advanced_storage.panels.no_resources') }}</p>
      </AdvancedStorageTechPanel>

      <AdvancedStorageBlockBackendsTable
        :backends="overview.advancedBlockBackends"
        :san-id="sanId"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import AdvancedStorageClusterPanel from '~/components/advanced-storage/AdvancedStorageClusterPanel.vue'
import type { AdvancedStorageOverview, AdvancedTechId, TechPresence } from '~/types/advanced-storage'
import { useAdvancedStorageClusterScope } from '~/composables/useAdvancedStorageClusterScope'

const route = useRoute()
const sanId = computed(() => route.params.id as string)
const { t } = useEsosI18n()

const {
  clusterScopeId,
  clusterName,
  isClusterMember,
  navigateToClusterNode,
  clusterOverview,
  clusterOverviewLoading,
  fetchClusterOverview,
  clusterRoleLabel,
} = useAdvancedStorageClusterScope(sanId)

const { data: san } = await useFetch<{ label: string; readOnly?: boolean }>(
  () => `/api/admin/sans/${sanId.value}`,
  { key: `san-${sanId.value}` },
)

const isReadOnly = computed(() => !!san.value?.readOnly)

const overview = ref<AdvancedStorageOverview | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const activeTechSummaries = computed(() =>
  (overview.value?.technologies ?? []).filter(t => !t.id.startsWith('deprecated')),
)

const scanTime = computed(() =>
  overview.value ? new Date(overview.value.scannedAt).toLocaleTimeString() : '',
)

const multipathText = computed(() =>
  overview.value?.multipath.maps.map(m =>
    `${m.alias} (${m.wwid}) — ${m.pathCount} path(s)`,
  ).join('\n') ?? '',
)

function techPresence(id: AdvancedTechId): TechPresence {
  return overview.value?.technologies.find(t => t.id === id)?.presence ?? 'not_installed'
}

async function refresh(force = false) {
  if (clusterScopeId.value && !isClusterMember.value) return
  loading.value = true
  error.value = null
  try {
    overview.value = await $fetch<AdvancedStorageOverview>('/api/advanced-storage/overview', {
      query: {
        sanId: sanId.value,
        ...(force ? { refresh: '1' } : {}),
      },
    })
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value = err.data?.statusMessage ?? err.statusMessage ?? err.message ?? 'Error'
  } finally {
    loading.value = false
  }
}

async function refreshAll(force = false) {
  await Promise.all([
    refresh(force),
    clusterScopeId.value ? fetchClusterOverview(force) : Promise.resolve(),
  ])
}

function scrollToTech(id: AdvancedTechId) {
  const el = document.getElementById(`panel-${id}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

watch(sanId, () => refresh())

onMounted(() => refreshAll())
</script>
