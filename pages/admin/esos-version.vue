<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {{ t('nav.items.esos_version') }}
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {{ t('admin.esos_version.page.subtitle') }}
        </p>
        <p v-if="scopeLabel !== '—'" class="text-xs text-gray-400 mt-1">
          {{ scopeLabel }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="versionStore.report" class="text-xs text-gray-400">
          {{ timeAgo }}
        </span>
        <UButton
          icon="i-heroicons-arrow-path"
          size="sm"
          color="gray"
          variant="soft"
          :loading="versionStore.loading"
          @click="versionStore.fetch(true)"
        >
          {{ t('admin.esos_version.page.refresh') }}
        </UButton>
      </div>
    </header>

    <UCard v-if="upgradeLink">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
            {{ t('admin.esos_version.page.upgrade_heading') }}
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ t('admin.esos_version.page.upgrade_hint') }}
          </p>
        </div>
        <UButton
          :to="upgradeLink"
          icon="i-heroicons-arrow-up-circle"
          color="primary"
          variant="soft"
        >
          {{ t('admin.esos_version.page.prepare_upgrade') }}
        </UButton>
      </div>
    </UCard>

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

      <div class="flex flex-wrap gap-3 pt-2">
        <UButton
          v-if="authStore.user?.role === 'admin'"
          to="/admin/app-version"
          variant="outline"
          color="gray"
          size="sm"
          icon="i-heroicons-cube-transparent"
        >
          {{ t('nav.items.webui_version') }}
        </UButton>
        <UButton
          v-if="authStore.user?.role !== 'viewer'"
          to="/admin/dependencies"
          variant="outline"
          color="gray"
          size="sm"
          icon="i-heroicons-cube"
        >
          {{ t('nav.items.dependencies') }}
        </UButton>
      </div>
    </template>

    <UAlert
      v-else-if="!upgradeLink"
      color="amber"
      variant="soft"
      icon="i-heroicons-information-circle"
      :title="t('admin.esos_version.page.no_san_title')"
      :description="t('admin.esos_version.page.no_san_desc')"
    />
  </div>
</template>

<script setup lang="ts">
import { isUpgradeSubTab, useUpgradeScope } from '~/composables/useUpgradeScope'

definePageMeta({ ssr: false })

const { t } = useEsosI18n()
const route = useRoute()
const router = useRouter()
const versionStore = useESOSVersionStore()
const authStore = useAuthStore()
const { scopeLabel, upgradeUrl } = useUpgradeScope()

const upgradeLink = computed(() => upgradeUrl('readiness'))

const timeAgo = computed(() => {
  if (!versionStore.report) return ''
  const diffSec = Math.floor((Date.now() - versionStore.report.scannedAt) / 1000)
  if (diffSec < 60) return t('admin.esos_version.page.time_ago_seconds', { count: diffSec })
  if (diffSec < 3600) return t('admin.esos_version.page.time_ago_minutes', { count: Math.floor(diffSec / 60) })
  return t('admin.esos_version.page.time_ago_hours', { count: Math.floor(diffSec / 3600) })
})

onMounted(() => {
  const legacyTab = route.query.tab
  const raw = Array.isArray(legacyTab) ? legacyTab[0] : legacyTab
  if (raw && raw !== 'version' && isUpgradeSubTab(raw)) {
    const target = upgradeUrl(raw)
    if (target) {
      void router.replace(target)
      return
    }
  }
  void versionStore.fetch()
})
</script>
