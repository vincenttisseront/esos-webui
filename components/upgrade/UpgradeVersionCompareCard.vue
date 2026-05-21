<template>
  <div
    v-if="availability"
    class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3"
  >
    <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">
      {{ t('admin.upgrade.version.title') }}
    </p>

    <div
      v-if="availability.overall === 'up-to-date'"
      class="rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 p-3 text-sm flex items-start gap-3"
    >
      <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
      <div>
        <p class="text-green-800 dark:text-green-200 font-medium">
          {{ t('admin.upgrade.version.up_to_date.title') }}
        </p>
        <p class="text-green-600 dark:text-green-400 text-xs mt-1">
          {{ upToDateDetail }}
        </p>
      </div>
    </div>

    <div v-else-if="availability.overall === 'upgrade-available'" class="space-y-3">
      <div
        class="rounded-lg border p-3 text-sm flex items-start gap-3"
        :class="updateClass"
      >
        <UIcon name="i-heroicons-arrow-up-circle" class="w-5 h-5 shrink-0 mt-0.5" :class="iconClass" />
        <div class="space-y-1">
          <p class="font-medium" :class="titleClass">
            {{ t('admin.upgrade.version.upgrade_available.title') }}
          </p>
          <div class="flex items-center gap-2 font-mono text-xs">
            <span class="text-gray-500 dark:text-gray-400">{{ primaryInstalled }}</span>
            <UIcon name="i-heroicons-arrow-right" class="w-3 h-3 text-gray-400" />
            <span class="font-bold" :class="versionClass">{{ availability.latestStable?.name }}</span>
          </div>
          <p v-if="primaryBehindCount && primaryBehindCount > 1" class="text-xs text-gray-500 dark:text-gray-400">
            {{ t('admin.upgrade.version.behind_count', { count: primaryBehindCount }) }}
          </p>
        </div>
      </div>
      <div v-if="availability.latestStable" class="flex flex-wrap gap-2">
        <a
          :href="availability.latestStable.downloadUrl"
          class="inline-flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          <UIcon name="i-heroicons-arrow-down-tray" class="w-3.5 h-3.5" />
          {{ t('admin.upgrade.version.download', { version: availability.latestStable.name }) }}
        </a>
        <a
          v-if="changelogUrl"
          :href="changelogUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          <UIcon name="i-heroicons-code-bracket" class="w-3.5 h-3.5" />
          {{ t('admin.upgrade.version.changelog') }}
        </a>
      </div>
    </div>

    <div
      v-else-if="availability.overall === 'mixed'"
      class="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-sm space-y-3"
    >
      <p class="text-amber-800 dark:text-amber-200 font-medium">
        {{ t('admin.upgrade.version.mixed.title') }}
      </p>
      <ul class="space-y-2 text-xs">
        <li
          v-for="node in availability.nodes"
          :key="node.sanId"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="font-medium text-gray-800 dark:text-gray-200">{{ node.label }}</span>
          <span class="font-mono text-gray-600 dark:text-gray-400">{{ installedLabel(node) }}</span>
          <UBadge size="xs" :color="nodeBadgeColor(node.status)" variant="subtle">
            {{ t(`admin.upgrade.version.node_status.${node.status}`) }}
          </UBadge>
        </li>
      </ul>
    </div>

    <div
      v-else-if="availability.overall === 'on-master'"
      class="rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 p-3 text-sm space-y-2"
    >
      <p class="text-purple-800 dark:text-purple-200 font-medium">
        {{ t('admin.upgrade.version.on_master.title') }}
      </p>
      <p class="text-purple-600 dark:text-purple-400 text-xs">
        {{ t('admin.upgrade.version.on_master.detail', { latest: availability.latestStable?.name ?? '—' }) }}
      </p>
    </div>

    <div
      v-else-if="availability.overall === 'github-unavailable'"
      class="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-sm space-y-2"
    >
      <p class="text-amber-800 dark:text-amber-200 font-medium">
        {{ t('admin.upgrade.version.github_unavailable.title') }}
      </p>
      <p class="text-amber-600 dark:text-amber-400 text-xs">
        {{ githubDetail }}
      </p>
    </div>

    <div
      v-else
      class="rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-600 dark:text-gray-400"
    >
      {{ t('admin.upgrade.version.not_comparable') }}
    </div>

    <ul
      v-if="showPerNodeRows && availability.nodes.length > 1 && availability.overall !== 'mixed'"
      class="text-xs space-y-1 border-t border-gray-100 dark:border-gray-800 pt-2"
    >
      <li
        v-for="node in availability.nodes"
        :key="node.sanId"
        class="flex flex-wrap gap-2 text-gray-600 dark:text-gray-400"
      >
        <span class="font-medium text-gray-800 dark:text-gray-200">{{ node.label }}</span>
        <span class="font-mono">{{ installedLabel(node) }}</span>
        <span v-if="node.status === 'upgrade-available' && availability.latestStable">
          → {{ availability.latestStable.name }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { UpgradeVersionAvailability, UpgradeVersionAvailabilityNode } from '~/types/upgrade'

const props = defineProps<{
  availability: UpgradeVersionAvailability | null | undefined
}>()

const { t } = useEsosI18n()

const primaryNode = computed(() => {
  const nodes = props.availability?.nodes ?? []
  return nodes.find(n => n.status === 'upgrade-available') ?? nodes[0]
})

const primaryDiff = computed(() => primaryNode.value?.diff ?? 'patch')

const primaryInstalled = computed(() => installedLabel(primaryNode.value))

const primaryBehindCount = computed(() => primaryNode.value?.behindCount)

const upToDateDetail = computed(() => {
  const latest = props.availability?.latestStable?.name
  const ver = props.availability?.nodes[0]?.installed.version ?? '—'
  return t('admin.upgrade.version.up_to_date.detail', { installed: ver, latest: latest ?? ver })
})

const githubDetail = computed(() => {
  const err = props.availability?.githubError
  if (err === 'rate_limit') return t('admin.upgrade.version.github_unavailable.rate_limit')
  return props.availability?.githubMessage ?? t('admin.upgrade.version.github_unavailable.detail')
})

const changelogUrl = computed(() => {
  const a = props.availability
  const from = primaryNode.value?.installed.version
  const to = a?.latestStable?.name
  if (!from || !to) return null
  return `https://github.com/quantum/esos/compare/${from}...${to}`
})

const showPerNodeRows = computed(() => {
  const o = props.availability?.overall
  return o === 'up-to-date' || o === 'upgrade-available' || o === 'github-unavailable'
})

const updateClass = computed(() => ({
  'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800': primaryDiff.value === 'patch',
  'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800': primaryDiff.value === 'minor',
  'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800': primaryDiff.value === 'major',
}))

const iconClass = computed(() => ({
  'text-blue-500': primaryDiff.value === 'patch',
  'text-amber-500': primaryDiff.value === 'minor',
  'text-red-500': primaryDiff.value === 'major',
}))

const titleClass = computed(() => ({
  'text-blue-800 dark:text-blue-200': primaryDiff.value === 'patch',
  'text-amber-800 dark:text-amber-200': primaryDiff.value === 'minor',
  'text-red-800 dark:text-red-200': primaryDiff.value === 'major',
}))

const versionClass = computed(() => ({
  'text-blue-700 dark:text-blue-300': primaryDiff.value === 'patch',
  'text-amber-700 dark:text-amber-300': primaryDiff.value === 'minor',
  'text-red-700 dark:text-red-300': primaryDiff.value === 'major',
}))

function installedLabel(node?: UpgradeVersionAvailabilityNode): string {
  if (!node) return '—'
  if (node.installed.buildType === 'stable' && node.installed.version) return node.installed.version
  return node.installed.raw || '—'
}

function nodeBadgeColor(status: string): 'green' | 'amber' | 'gray' | 'purple' {
  if (status === 'up-to-date' || status === 'ahead-of-release') return 'green'
  if (status === 'upgrade-available') return 'amber'
  if (status === 'on-master') return 'purple'
  return 'gray'
}
</script>
