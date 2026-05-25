<script setup lang="ts">
const admin     = useAdminStore()
const authStore = useAuthStore()
const depsStore = useDepsStore()
const { t }     = useEsosI18n()

onMounted(() => {
  admin.fetchAll()
})

// Charger les dépendances uniquement quand le rôle est connu et non-viewer
watchEffect(() => {
  if (!depsStore.report && authStore.user && authStore.user.role !== 'viewer') {
    depsStore.fetch()
  }
})

// SANs configurés
const { data: sansList, refresh: refreshSans } = await useFetch<Array<{
  id: string; label: string; host: string; status: string
}>>('/api/admin/sans')
const sansCount = computed(() => sansList.value?.length ?? 0)

// ─── Historique connexions ─────────────────────────────────────────────────────
const { data: loginHistory } = await useFetch<Array<{
  id: number
  userId: string
  success: boolean
  ip: string | null
  userAgent: string | null
  at: string
}>>('/api/admin/login-history')

const recentLogins = computed(() => (loginHistory.value ?? []).slice(0, 5))

function formatDate(s: string): string {
  return new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-4xl mx-auto">
    <header class="flex items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ t('admin.index.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t('admin.index.subtitle') }}</p>
      </div>
      <UButton to="/admin/dependencies" color="gray" variant="soft" icon="i-heroicons-cube">
        {{ t('admin.index.dependencies') }}
        <UBadge
          v-if="depsStore.majorCount > 0"
          :label="String(depsStore.majorCount)"
          color="red"
          size="xs"
          class="ml-2"
        />
      </UButton>
    </header>

    <div v-if="admin.loading" class="flex items-center justify-center py-16 text-gray-400">
      <span class="text-2xl mr-3 animate-spin">↻</span> {{ t('admin.index.loading') }}
    </div>

    <template v-else>

      <!-- Section 0 : SANs ESOS -->
      <AdminSection :title="t('admin.index.sans_section')" icon="i-heroicons-server-stack">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('admin.index.sans_desc') }}
            </p>
            <UBadge
              v-if="sansCount > 0"
              :label="t('admin.index.sans_count', { count: sansCount })"
              color="green"
              variant="soft"
            />
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <UButton
              v-if="sansCount > 0"
              icon="i-heroicons-list-bullet"
              :label="t('admin.index.manage_sans')"
              color="gray"
              variant="soft"
              to="/admin/sans"
            />
            <UButton
              v-if="authStore.user?.role !== 'viewer'"
              icon="i-heroicons-plus"
              :label="t('admin.index.add_san')"
              to="/admin/sans"
            />
          </div>
        </div>
      </AdminSection>

      <!-- Section 1 : SSH (mode v1 — connexion unique) -->
      <AdminSSHSettingsForm v-if="admin.sshForm" />

      <!-- Section 2b : Seuils d'alerte (admin) -->
      <AdminSection v-if="authStore.user?.role === 'admin'" :title="t('admin.index.alert_thresholds_section')" icon="i-heroicons-bell-alert">
        <div class="flex items-center justify-between gap-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('admin.index.alert_thresholds_desc') }}
          </p>
          <UButton
            to="/admin/alert-thresholds"
            icon="i-heroicons-adjustments-horizontal"
            :label="t('admin.index.configure')"
            color="gray"
            variant="soft"
          />
        </div>
      </AdminSection>

      <!-- Fournisseurs d’authentification (admin) -->
      <AdminSection
        v-if="authStore.user?.role === 'admin' || authStore.user?.role === 'operator' || authStore.user?.role === 'viewer'"
        :title="t('admin.index.auth_providers_section')"
        icon="i-heroicons-shield-check"
      >
        <div class="flex items-center justify-between gap-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('admin.index.auth_providers_desc') }}
          </p>
          <UButton
            to="/admin/auth-providers"
            icon="i-heroicons-key"
            :label="t('admin.index.configure')"
            color="gray"
            variant="soft"
          />
        </div>
      </AdminSection>

      <!-- Section 2 : Collecteur -->
      <AdminCollectorSettings v-if="admin.collector" />

      <!-- Section 3 : Cluster HA -->
      <AdminSection :title="t('admin.index.cluster_section')" icon="i-heroicons-server-stack">
        <div class="flex items-center justify-between gap-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('admin.index.cluster_desc') }}
          </p>
          <div class="flex items-center gap-2 shrink-0">
            <UButton
              v-if="authStore.user?.role === 'admin'"
              to="/admin/cluster"
              icon="i-heroicons-wrench-screwdriver"
              :label="t('admin.index.configure')"
              color="gray"
              variant="soft"
            />
            <UButton
              to="/cluster"
              icon="i-heroicons-chart-bar"
              :label="t('admin.index.monitoring')"
              color="primary"
              variant="soft"
            />
          </div>
        </div>
      </AdminSection>

      <!-- Section 4 : Compte administrateur -->
      <AdminSection :title="t('admin.index.admin_account_section')" icon="i-heroicons-user-circle">
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ authStore.user?.username ?? '—' }}</p>
              <p class="text-xs text-gray-400">
                {{ t('admin.index.last_login') }}
                {{ authStore.user?.lastLoginAt ? formatDate(authStore.user.lastLoginAt) : t('admin.index.last_login_unknown') }}
              </p>
            </div>
            <UButton
              size="sm"
              variant="soft"
              icon="i-heroicons-key"
              to="/admin/change-password"
              :label="t('admin.index.change_password')"
            />
          </div>

          <div v-if="recentLogins.length > 0">
            <p class="text-xs text-gray-400 uppercase tracking-wide mb-2">{{ t('admin.index.login_history') }}</p>
            <ul class="space-y-1">
              <li
                v-for="ev in recentLogins"
                :key="ev.id"
                class="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400"
              >
                <span
                  class="w-2 h-2 rounded-full shrink-0"
                  :class="ev.success ? 'bg-green-400' : 'bg-red-400'"
                />
                <span class="font-mono">{{ formatDate(ev.at) }}</span>
                <span class="text-gray-400">{{ ev.ip ?? '—' }}</span>
                <span :class="ev.success ? 'text-green-600' : 'text-red-600'">
                  {{ ev.success ? t('admin.index.login_success') : t('admin.index.login_failure') }}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </AdminSection>

      <!-- Section 4 : Informations système -->
      <AdminSystemInfoPanel v-if="admin.systemInfo" :info="admin.systemInfo" />

      <!-- Section 5 : Zone de danger -->
      <AdminDangerZone />

    </template>
  </div>
</template>
