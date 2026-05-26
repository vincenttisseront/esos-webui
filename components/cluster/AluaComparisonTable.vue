<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs">
      <thead>
        <tr class="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
          <th class="py-2 pr-3 font-medium">{{ t('cluster.alua.table.headers.deviceGroup') }}</th>
          <th class="py-2 pr-3 font-medium">{{ t('cluster.alua.table.headers.targetGroup') }}</th>
          <th
            v-for="node in nodes"
            :key="node.nodeId"
            class="py-2 pr-3 font-medium"
          >
            {{ node.hostname }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="`${row.deviceGroup}-${row.targetGroup}`"
          class="border-b border-gray-100 dark:border-gray-800"
        >
          <td class="py-2 pr-3 font-mono text-gray-800 dark:text-gray-200">{{ row.deviceGroup }}</td>
          <td class="py-2 pr-3 font-mono text-gray-600 dark:text-gray-400">{{ row.targetGroup }}</td>
          <td
            v-for="cell in row.cells"
            :key="cell.nodeId"
            class="py-2 pr-3 align-top"
          >
            <template v-if="cell.missing">
              <span class="text-gray-400">—</span>
            </template>
            <template v-else>
              <ALUAStateBadge :state="cell.state!" />
              <p v-if="cell.groupId != null" class="text-[10px] text-gray-500 mt-0.5">
                {{ t('cluster.alua.table.headers.groupId') }}: {{ cell.groupId }}
              </p>
              <p class="text-[10px] text-gray-500">
                {{ t('cluster.alua.table.targetCount', { count: cell.targetCount }) }}
              </p>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="text-xs text-gray-500 dark:text-gray-400 py-2">
      {{ t('cluster.alua.table.empty') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { AluaClusterReport } from '~/types/alua'
import type { ALUAState } from '~/types/alua'

const props = defineProps<{
  report: AluaClusterReport
}>()

const { t } = useEsosI18n()

const nodes = computed(() => props.report.nodes)

interface MatrixRow {
  deviceGroup: string
  targetGroup: string
  cells: Array<{
    nodeId:      string
    missing:     boolean
    state?:      ALUAState
    groupId?:    number | null
    targetCount: number
  }>
}

const rows = computed((): MatrixRow[] => {
  const dgNames = new Set<string>()
  const tgByDg  = new Map<string, Set<string>>()

  for (const node of props.report.nodes) {
    for (const dg of node.deviceGroups) {
      dgNames.add(dg.name)
      const tgSet = tgByDg.get(dg.name) ?? new Set()
      for (const tg of dg.targetGroups) tgSet.add(tg.name)
      tgByDg.set(dg.name, tgSet)
    }
  }

  const result: MatrixRow[] = []
  for (const dgName of [...dgNames].sort()) {
    for (const tgName of [...(tgByDg.get(dgName) ?? [])].sort()) {
      const cells = props.report.nodes.map((node) => {
        const dg = node.deviceGroups.find(d => d.name === dgName)
        const tg = dg?.targetGroups.find(t => t.name === tgName)
        if (!tg) {
          return { nodeId: node.nodeId, missing: true, targetCount: 0 }
        }
        return {
          nodeId:      node.nodeId,
          missing:     false,
          state:       tg.state,
          groupId:     tg.groupId,
          targetCount: tg.targets.length,
        }
      })
      result.push({ deviceGroup: dgName, targetGroup: tgName, cells })
    }
  }
  return result
})
</script>
