<template>
  <div class="esos-card">
    <div class="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
      <UInput
        v-model="deps.filterQuery"
        icon="i-heroicons-magnifying-glass"
        :placeholder="t('admin.dependencies.table.filterPlaceholder')"
        size="sm"
        class="w-52"
      />

      <div class="flex gap-1">
        <button
          v-for="opt in diffFilters"
          :key="opt.value"
          class="px-2.5 py-1 text-xs rounded-lg transition-colors"
          :class="deps.filterDiff === opt.value ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="deps.filterDiff = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>

      <div class="flex gap-1">
        <button
          v-for="opt in typeFilters"
          :key="opt.value"
          class="px-2.5 py-1 text-xs rounded-lg transition-colors"
          :class="deps.filterType === opt.value ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="deps.filterType = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>

      <span class="ml-auto text-xs text-gray-400">
        {{ t('admin.dependencies.table.count', { filtered: deps.filtered.length, total: deps.report?.totalCount ?? 0 }) }}
      </span>
    </div>

    <div class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('admin.dependencies.table.headers.package') }}</th>
            <th>{{ t('admin.dependencies.table.headers.installed') }}</th>
            <th>{{ t('admin.dependencies.table.headers.latest') }}</th>
            <th>{{ t('admin.dependencies.table.headers.bump') }}</th>
            <th>{{ t('admin.dependencies.table.headers.published') }}</th>
            <th>{{ t('admin.dependencies.table.headers.type') }}</th>
            <th class="text-right">{{ t('admin.dependencies.table.headers.links') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="pkg in deps.filtered" :key="pkg.name">
            <td>
              <div>
                <span class="font-identifier font-medium text-gray-800">{{ pkg.name }}</span>
                <p v-if="pkg.description" class="text-xs text-gray-400 truncate max-w-xs mt-0.5">
                  {{ pkg.description }}
                </p>
              </div>
            </td>

            <td>
              <span class="font-identifier text-gray-600">{{ pkg.installedClean }}</span>
            </td>

            <td>
              <span
                class="font-identifier"
                :class="{
                  'text-red-600 font-semibold': pkg.diff === 'major',
                  'text-amber-600': pkg.diff === 'minor',
                  'text-blue-600': pkg.diff === 'patch',
                  'text-gray-400': pkg.diff === 'up-to-date',
                  'text-gray-300 italic': pkg.diff === 'unknown',
                }"
              >
                {{ pkg.latestVersion }}
              </span>
            </td>

            <td><DiffBadge :diff="pkg.diff" /></td>

            <td class="text-gray-400">
              {{ pkg.publishedAt ? formatDate(pkg.publishedAt) : '—' }}
            </td>

            <td>
              <span
                class="text-xs px-1.5 py-0.5 rounded font-medium"
                :class="pkg.type === 'dependencies' ? 'bg-violet-50 text-violet-600' : 'bg-gray-100 text-gray-500'"
              >
                {{ pkg.type === 'dependencies' ? t('admin.dependencies.table.typeDep') : t('admin.dependencies.table.typeDev') }}
              </span>
            </td>

            <td class="text-right">
              <div class="flex items-center justify-end gap-1">
                <a
                  :href="pkg.npmUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-gray-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-gray-100"
                  :title="t('admin.dependencies.table.linkNpm')"
                >
                  <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                    <path d="M0 256V0h256v256H128v-32H32v32H0zm32-64h64V64h64v128h32V32H32v160z"/>
                  </svg>
                </a>

                <a
                  v-if="pkg.repoUrl"
                  :href="pkg.repoUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded hover:bg-gray-100"
                  :title="t('admin.dependencies.table.linkGithub')"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                  </svg>
                </a>

                <a
                  v-if="pkg.repoUrl && pkg.repoUrl.includes('github.com')"
                  :href="`${pkg.repoUrl}/releases`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-gray-400 hover:text-blue-500 transition-colors p-1 rounded hover:bg-gray-100"
                  :title="t('admin.dependencies.table.linkChangelog')"
                >
                  <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
                </a>
              </div>
            </td>
          </tr>

          <tr v-if="deps.filtered.length === 0">
            <td colspan="7">
              <div class="empty-state">
                <span class="empty-state-icon">pkg</span>
                <span>{{ t('admin.dependencies.table.empty') }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DepType, SemverDiff } from '~/server/utils/types'

const { t, locale } = useEsosI18n()
const deps = useDepsStore()

const diffFilters = computed(() => [
  { value: 'all' as const, label: t('admin.dependencies.filters.diff.all') },
  { value: 'major' as const, label: t('admin.dependencies.filters.diff.major') },
  { value: 'minor' as const, label: t('admin.dependencies.filters.diff.minor') },
  { value: 'patch' as const, label: t('admin.dependencies.filters.diff.patch') },
  { value: 'up-to-date' as const, label: t('admin.dependencies.filters.diff.upToDate') },
])

const typeFilters = computed(() => [
  { value: 'all' as const, label: t('admin.dependencies.filters.type.all') },
  { value: 'dependencies' as const, label: t('admin.dependencies.filters.type.production') },
  { value: 'devDependencies' as const, label: t('admin.dependencies.filters.type.dev') },
])

function formatDate(iso: string): string {
  const loc = locale.value === 'en' ? 'en-GB' : 'fr-FR'
  return new Date(iso).toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>
