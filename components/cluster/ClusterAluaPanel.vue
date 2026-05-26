<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {{ t('cluster.alua.tab.title') }}
        </h2>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {{ t('cluster.alua.tab.subtitle') }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="canConfigure"
          icon="i-heroicons-cog-6-tooth"
          color="primary"
          variant="soft"
          size="xs"
          :label="t('cluster.alua.configure')"
          @click="emit('configure')"
        />
        <UBadge :color="healthColor" variant="soft" size="sm">
          {{ t(`cluster.alua.health.${report.comparison.health}`) }}
        </UBadge>
        <UButton
          icon="i-heroicons-arrow-path"
          color="gray"
          variant="soft"
          size="xs"
          :loading="loading"
          :label="t('cluster.alua.refresh')"
          @click="emit('refresh')"
        />
      </div>
    </div>

    <p class="text-sm text-gray-600 dark:text-gray-400">
      {{ summaryText }}
    </p>

    <p v-if="includeScstCrossCheck" class="text-xs text-gray-500">
      {{ t('cluster.alua.cross_check') }}
    </p>

    <AluaComparisonTable :report="report" />

    <div v-if="report.comparison.issues.length" class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2">
      <p class="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">
        {{ t('cluster.alua.issues.title') }}
      </p>
      <ul class="space-y-1 text-xs text-amber-900 dark:text-amber-100">
        <li v-for="(issue, idx) in report.comparison.issues" :key="idx">
          {{ issueMessage(issue) }}
        </li>
      </ul>
    </div>

    <div class="space-y-2">
      <details
        v-for="dg in allDeviceGroups"
        :key="dg.key"
        class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        open
      >
        <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 select-none list-none">
          {{ dg.name }}
          <span class="text-xs font-normal text-gray-400 ml-2">
            {{ dg.devices.length ? dg.devices.join(', ') : t('cluster.alua.deviceGroup.empty_devices') }}
          </span>
        </summary>
        <div class="px-3 pb-3 space-y-3 border-t border-gray-100 dark:border-gray-800">
          <p class="text-xs text-gray-500 pt-2">
            {{ t('cluster.alua.deviceGroup.devices') }}:
            <span class="font-mono text-gray-700 dark:text-gray-300">{{ dg.devices.join(', ') || '—' }}</span>
          </p>
          <div
            v-for="tg in dg.targetGroups"
            :key="`${dg.name}-${tg.name}-${tg.nodeId}`"
            class="rounded border border-gray-100 dark:border-gray-800 px-2 py-2"
          >
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="font-mono text-xs text-gray-700 dark:text-gray-300">{{ tg.name }}</span>
              <UBadge size="xs" color="gray" variant="subtle">
                {{ t(`cluster.alua.role.${tg.role}`) }}
              </UBadge>
              <ALUAStateBadge :state="tg.state" />
              <span v-if="tg.groupId != null" class="text-[10px] text-gray-400">
                {{ t('cluster.alua.table.headers.groupId') }} {{ tg.groupId }}
              </span>
              <span class="text-[10px] text-gray-400 ml-auto">{{ tg.nodeLabel }}</span>
            </div>
            <table v-if="tg.targets.length" class="w-full text-[11px]">
              <thead>
                <tr class="text-gray-400 text-left">
                  <th class="pb-1">{{ t('cluster.alua.targetGroup.targets_title') }}</th>
                  <th class="pb-1">{{ t('cluster.alua.targetGroup.rel_tgt_id') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="target in tg.targets" :key="target.targetName" class="font-mono text-gray-600 dark:text-gray-400">
                  <td class="py-0.5">{{ target.targetName }}</td>
                  <td class="py-0.5">{{ target.relTargetId ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="text-[11px] text-gray-400 italic">{{ t('cluster.alua.targetGroup.empty') }}</p>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AluaClusterReport, AluaIssue } from '~/types/alua'

const props = defineProps<{
  report: AluaClusterReport
  loading?: boolean
  includeScstCrossCheck?: boolean
  canConfigure?: boolean
}>()

const emit = defineEmits<{ (e: 'refresh'): void; (e: 'configure'): void }>()

const { t } = useEsosI18n()

const healthColor = computed(() => {
  switch (props.report.comparison.health) {
    case 'ok': return 'green'
    case 'missing': return 'amber'
    case 'invalid_refs': return 'red'
    case 'asymmetric': return 'amber'
    default: return 'gray'
  }
})

const summaryText = computed(() => {
  const { summaryKey, summaryParams } = props.report.comparison
  return t(summaryKey, summaryParams ?? {})
})

function issueMessage(issue: AluaIssue): string {
  const params: Record<string, string | number> = { ...issue.messageParams }
  if (issue.nodeIds?.length) params.nodeIds = issue.nodeIds.join(', ')
  if (issue.deviceGroup) params.deviceGroup = issue.deviceGroup
  if (issue.targetGroup) params.targetGroup = issue.targetGroup
  if (issue.targetName) params.targetName = issue.targetName
  return t(issue.messageKey, params)
}

const allDeviceGroups = computed(() => {
  const items: Array<{
    key: string
    name: string
    devices: string[]
    targetGroups: Array<{
      nodeId: string
      nodeLabel: string
      name: string
      role: string
      state: import('~/types/alua').ALUAState
      groupId: number | null
      targets: import('~/types/alua').AluaTargetRef[]
    }>
  }> = []

  const dgNames = new Set<string>()
  for (const node of props.report.nodes) {
    for (const dg of node.deviceGroups) dgNames.add(dg.name)
  }

  for (const dgName of [...dgNames].sort()) {
    const devices = new Set<string>()
    const targetGroups: (typeof items)[0]['targetGroups'] = []

    for (const node of props.report.nodes) {
      const dg = node.deviceGroups.find(d => d.name === dgName)
      if (!dg) continue
      for (const d of dg.devices) devices.add(d)
      for (const tg of dg.targetGroups) {
        targetGroups.push({
          nodeId:    node.nodeId,
          nodeLabel: node.hostname,
          name:      tg.name,
          role:      tg.role,
          state:     tg.state,
          groupId:   tg.groupId,
          targets:   tg.targets,
        })
      }
    }

    items.push({
      key:          dgName,
      name:         dgName,
      devices:      [...devices].sort(),
      targetGroups: targetGroups.sort((a, b) => a.nodeLabel.localeCompare(b.nodeLabel) || a.name.localeCompare(b.name)),
    })
  }
  return items
})
</script>
