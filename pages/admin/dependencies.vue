<template>
  <div class="space-y-5 max-w-6xl mx-auto p-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-lg font-semibold text-gray-800 dark:text-gray-200">{{ t('admin.dependencies.page.title') }}</h1>
        <p class="text-xs text-gray-400 mt-0.5">
          {{ t('admin.dependencies.page.subtitle') }}
          <span v-if="deps.report">{{ t('admin.dependencies.page.subtitleScan', { ago: deps.scannedAgo }) }}</span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="exportScope"
          :options="exportScopeOptions"
          value-attribute="value"
          option-attribute="label"
          size="sm"
          class="w-52"
        />

        <UButton
          icon="i-heroicons-document-arrow-down"
          size="sm"
          color="gray"
          variant="outline"
          :disabled="!canExport"
          :label="t('admin.dependencies.actions.exportCsv')"
          @click="downloadCsv"
        />

        <UButton
          icon="i-heroicons-code-bracket"
          size="sm"
          color="gray"
          variant="outline"
          :disabled="!canExport"
          :label="t('admin.dependencies.actions.exportJson')"
          @click="downloadJson"
        />

        <UButton
          icon="i-heroicons-arrow-path"
          size="sm"
          color="gray"
          variant="outline"
          :loading="deps.loading"
          :label="t('admin.dependencies.actions.refresh')"
          @click="deps.fetch(true)"
        />
      </div>
    </div>

    <template v-if="deps.loading && !deps.report">
      <div class="esos-card p-8 text-center">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin w-6 h-6 text-gray-400 mx-auto mb-3" />
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('admin.dependencies.loading.title') }}
        </p>
        <p class="text-xs text-gray-400 mt-1">{{ t('admin.dependencies.loading.hint') }}</p>
      </div>
    </template>

    <template v-else-if="deps.error">
      <div class="esos-card p-6 border-red-200 dark:border-red-800">
        <p class="text-sm text-red-600">{{ deps.error }}</p>
      </div>
    </template>

    <template v-else-if="deps.report">
      <DepsStats :report="deps.report" />

      <div
        v-if="deps.report.outdated === 0"
        class="esos-card px-5 py-3 bg-green-50 dark:bg-green-950/40 border-green-200 flex items-center gap-3"
      >
        <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 shrink-0" />
        <p class="text-sm text-green-700 font-medium">
          {{ t('admin.dependencies.status.allUpToDate') }}
        </p>
      </div>

      <DependencyTable />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PackageDep } from '~/server/utils/types'

const { t } = useEsosI18n()
const deps = useDepsStore()

type ExportScope = 'all' | 'outdated'

const exportScope = ref<ExportScope>('all')

const exportScopeOptions = computed(() => [
  { value: 'all' as const, label: t('admin.dependencies.export.scope.all') },
  { value: 'outdated' as const, label: t('admin.dependencies.export.scope.outdated') },
])

const exportPackages = computed<PackageDep[]>(() => {
  const packages = deps.report?.packages ?? []
  if (exportScope.value === 'all') return packages
  return packages.filter((pkg) => ['major', 'minor', 'patch'].includes(pkg.diff))
})

const canExport = computed(() => exportPackages.value.length > 0)

function makeExportFilename(ext: 'csv' | 'json'): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const scope = exportScope.value === 'all' ? 'all' : 'outdated'
  return `dependencies-${scope}-${stamp}.${ext}`
}

function triggerDownload(content: string, contentType: string, filename: string) {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()

  URL.revokeObjectURL(url)
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function toCsv(packages: PackageDep[]): string {
  const headers = [
    'name',
    'installedVersion',
    'installedClean',
    'latestVersion',
    'diff',
    'type',
    'publishedAt',
    'npmUrl',
    'repoUrl',
    'description',
  ]

  const rows = packages.map((pkg) => [
    pkg.name,
    pkg.installedVersion,
    pkg.installedClean,
    pkg.latestVersion,
    pkg.diff,
    pkg.type,
    pkg.publishedAt ?? '',
    pkg.npmUrl,
    pkg.repoUrl ?? '',
    pkg.description ?? '',
  ])

  return [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => escapeCsv(cell)).join(',')),
  ].join('\n')
}

function downloadCsv() {
  if (!canExport.value) return
  const csv = toCsv(exportPackages.value)
  triggerDownload(csv, 'text/csv;charset=utf-8', makeExportFilename('csv'))
}

function downloadJson() {
  if (!canExport.value) return
  const payload = {
    generatedAt: new Date().toISOString(),
    scope: exportScope.value,
    total: exportPackages.value.length,
    packages: exportPackages.value,
  }
  triggerDownload(
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8',
    makeExportFilename('json'),
  )
}

onMounted(() => {
  if (!deps.report) deps.fetch()
})
</script>
