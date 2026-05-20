<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs">
      <thead>
        <tr class="text-left text-gray-500 border-b">
          <th v-for="col in columns" :key="col.key" class="py-1.5 pr-3">{{ col.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, idx) in rows"
          :key="rowKey(row, idx)"
          class="border-b border-gray-100 dark:border-gray-800"
          :class="row.isPrimary ? 'bg-primary-50/30 dark:bg-primary-950/20' : ''"
        >
          <td v-for="col in columns" :key="col.key" class="py-1.5 pr-3" :class="col.mono ? 'font-mono' : ''">
            <template v-if="col.key === 'status'">
              <UBadge :color="statusColor(row.status)" variant="soft" size="xs" :label="statusLabel(row.status)" />
              <span v-if="row.statusDetail" class="block text-[10px] text-gray-500 mt-0.5 max-w-[12rem] truncate" :title="row.statusDetail">
                {{ row.statusDetail }}
              </span>
            </template>
            <template v-else-if="col.key === 'actions'">
              <slot name="actions" :row="row" />
            </template>
            <template v-else>
              {{ cellValue(row, col.key) }}
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="text-xs text-gray-500 py-2">{{ emptyText }}</p>
  </div>
</template>

<script setup lang="ts">
import type { ClusterRowStatus } from '~/utils/lvm-cluster-view-model'

export interface ComparisonColumn {
  key: string
  label: string
  mono?: boolean
}

const props = defineProps<{
  columns: ComparisonColumn[]
  rows: Array<Record<string, unknown> & { status: ClusterRowStatus; statusDetail?: string; isPrimary?: boolean }>
  emptyText: string
}>()

const { t } = useEsosI18n()

function rowKey(row: Record<string, unknown>, idx: number) {
  return `${row.nodeSanId ?? idx}-${row.path ?? row.name ?? idx}`
}

function cellValue(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  if (v == null || v === '') return '—'
  return String(v)
}

function statusLabel(status: ClusterRowStatus) {
  return t(`lvm.cluster.view.status.${status}`)
}

function statusColor(status: ClusterRowStatus): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  switch (status) {
    case 'ok': return 'green'
    case 'ssh_down': return 'gray'
    case 'missing': return 'amber'
    case 'clvmd':
    case 'inconsistent':
    case 'scst_missing':
      return 'amber'
    default: return 'red'
  }
}
</script>
