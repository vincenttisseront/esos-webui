<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <!-- En-tête -->
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('admin.appVersion.page.title') }}</h1>
        <p class="text-sm text-gray-500 mt-1">{{ t('admin.appVersion.page.subtitle') }}</p>
      </div>
      <UButton
        icon="i-heroicons-arrow-path"
        size="sm"
        color="gray"
        variant="soft"
        :loading="store.loading"
        :label="t('admin.appVersion.actions.refresh')"
        @click="handleRefresh"
      />
    </header>

    <!-- Erreur -->
    <UAlert
      v-if="store.error"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :title="store.error"
    />

    <!-- Carte version courante -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Informations de build -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <UIcon name="i-heroicons-cube-transparent" class="w-4 h-4" />
          {{ t('admin.appVersion.build.title') }}
        </h2>
        <div v-if="store.version" class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('admin.appVersion.build.fields.version') }}</span>
            <span class="font-mono font-semibold text-gray-900">{{ store.version.version }}</span>
          </div>
          <div v-if="store.version.build" class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('admin.appVersion.build.fields.buildId') }}</span>
            <span class="font-mono text-gray-700">{{ store.version.build }}</span>
          </div>
          <div v-if="store.version.gitCommit" class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('admin.appVersion.build.fields.commit') }}</span>
            <span class="font-mono text-gray-700">{{ store.version.gitCommit.slice(0, 12) }}</span>
          </div>
          <div v-if="store.version.gitBranch" class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('admin.appVersion.build.fields.branch') }}</span>
            <span class="font-mono text-gray-700">{{ store.version.gitBranch }}</span>
          </div>
          <div v-if="store.version.buildDate" class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('admin.appVersion.build.fields.buildDate') }}</span>
            <span class="text-gray-700">{{ formatDate(store.version.buildDate) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('admin.appVersion.build.fields.environment') }}</span>
            <UBadge
              :label="store.version.environment ?? 'unknown'"
              :color="store.version.environment === 'production' ? 'green' : 'amber'"
              variant="soft"
              size="xs"
            />
          </div>
        </div>
        <div v-else class="flex items-center gap-2 text-gray-400 text-sm py-4">
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
          {{ t('admin.appVersion.build.loading') }}
        </div>
      </div>

      <!-- Informations base de données -->
      <div class="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <UIcon name="i-heroicons-circle-stack" class="w-4 h-4" />
          {{ t('admin.appVersion.db.title') }}
        </h2>
        <div v-if="store.version" class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('admin.appVersion.db.fields.schema') }}</span>
            <span class="font-mono font-semibold text-gray-900">v{{ store.version.dbSchemaVersion }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('admin.appVersion.db.fields.updatedAt') }}</span>
            <span class="text-gray-700">{{ formatDate(store.version.updatedAt) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500">{{ t('admin.appVersion.db.fields.migrationsApplied') }}</span>
            <span class="font-mono font-semibold text-gray-900">
              {{ migrations?.database.migrations.length ?? '—' }}
            </span>
          </div>
          <div v-if="store.version.transient" class="pt-2">
            <UAlert
              color="amber"
              variant="soft"
              icon="i-heroicons-exclamation-triangle"
              :title="t('admin.appVersion.db.transientTitle')"
              :description="t('admin.appVersion.db.transientDesc')"
              size="sm"
            />
          </div>
        </div>
        <div v-else class="flex items-center gap-2 text-gray-400 text-sm py-4">
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
          {{ t('admin.appVersion.db.loading') }}
        </div>
      </div>
    </div>

    <!-- Historique des versions -->
    <div class="bg-white rounded-xl border border-gray-200">
      <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-700">
          {{ t('admin.appVersion.history.title') }}
        </h2>
        <span class="text-xs text-gray-400">{{ t('admin.appVersion.history.entryCount', { count: store.history.length }) }}</span>
      </div>

      <div v-if="!store.history.length" class="px-5 py-8 text-center text-sm text-gray-400">
        {{ t('admin.appVersion.history.empty') }}
      </div>

      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-100">
            <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              {{ t('admin.appVersion.history.cols.version') }}
            </th>
            <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              {{ t('admin.appVersion.history.cols.previous') }}
            </th>
            <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              {{ t('admin.appVersion.history.cols.commit') }}
            </th>
            <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              {{ t('admin.appVersion.history.cols.source') }}
            </th>
            <th class="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              {{ t('admin.appVersion.history.cols.date') }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <tr v-for="entry in store.history" :key="entry.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-5 py-3 font-mono font-semibold text-gray-900">{{ entry.version }}</td>
            <td class="px-5 py-3 font-mono text-gray-500">{{ entry.previousVersion ?? '—' }}</td>
            <td class="px-5 py-3 font-mono text-gray-500 text-xs">{{ entry.gitCommit?.slice(0, 10) ?? '—' }}</td>
            <td class="px-5 py-3">
              <UBadge
                :label="entry.source"
                :color="sourceColor(entry.source)"
                variant="soft"
                size="xs"
              />
            </td>
            <td class="px-5 py-3 text-gray-500 text-xs">{{ formatDate(entry.appliedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Migrations SQL -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-700">
          {{ t('admin.appVersion.migrations.title') }}
        </h2>
        <span class="text-xs text-gray-400">
          {{ t('admin.appVersion.migrations.entryCount', { count: migrations?.database.migrations.length ?? 0 }) }}
        </span>
      </div>

      <div v-if="migrationsError" class="px-5 py-4">
        <UAlert
          color="red"
          variant="soft"
          icon="i-heroicons-exclamation-triangle"
          :title="t('admin.appVersion.migrations.loadError')"
        />
      </div>

      <div v-else-if="!migrations" class="flex items-center gap-2 text-gray-400 text-sm px-5 py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
        {{ t('admin.appVersion.migrations.loading') }}
      </div>

      <div v-else-if="migrations.database.migrations.length === 0" class="px-5 py-8 text-center text-sm text-gray-400 italic">
        {{ t('admin.appVersion.migrations.empty') }}
      </div>

      <table v-else class="w-full text-xs">
        <thead class="bg-gray-50 border-b border-gray-100">
          <tr>
            <th class="px-5 py-2 text-left font-medium text-gray-500 w-12">{{ t('admin.appVersion.migrations.cols.num') }}</th>
            <th class="px-5 py-2 text-left font-medium text-gray-500">{{ t('admin.appVersion.migrations.cols.name') }}</th>
            <th class="px-5 py-2 text-left font-medium text-gray-500 hidden md:table-cell">{{ t('admin.appVersion.migrations.cols.hash') }}</th>
            <th class="px-5 py-2 text-right font-medium text-gray-500">{{ t('admin.appVersion.migrations.cols.appliedAt') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          <tr
            v-for="m in migrations.database.migrations"
            :key="m.idx"
            class="hover:bg-gray-50 transition-colors"
          >
            <td class="px-5 py-2.5 text-gray-400 font-mono">{{ m.idx }}</td>
            <td class="px-5 py-2.5 font-mono text-gray-700 font-medium">{{ m.tag }}</td>
            <td class="px-5 py-2.5 hidden md:table-cell font-mono text-gray-400">{{ m.hash }}</td>
            <td class="px-5 py-2.5 text-right text-gray-500">
              {{ m.appliedAt ? formatDate(m.appliedAt) : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

  </div>
</template>

<script setup lang="ts">
definePageMeta({ ssr: false })

const { t, locale } = useEsosI18n()
const store = useAppVersionStore()
const { data: migrations, error: migrationsError } = await useFetch('/api/admin/app-version')

onMounted(async () => {
  await store.fetchVersion()
  await store.fetchHistory()
})

async function handleRefresh() {
  await store.refresh()
  await store.fetchHistory()
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    const loc = locale.value === 'en' ? 'en-GB' : 'fr-FR'
    return new Intl.DateTimeFormat(loc, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function sourceColor(source: string): 'green' | 'blue' | 'amber' | 'gray' {
  switch (source) {
    case 'startup':   return 'blue'
    case 'migration': return 'green'
    case 'manual':    return 'amber'
    case 'ci':        return 'green'
    default:          return 'gray'
  }
}
</script>
