<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {{ t('advanced_storage.cluster.panel_title', { name: clusterName }) }}
          </h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {{ t('advanced_storage.cluster.panel_subtitle') }}
          </p>
        </div>
        <UBadge
          v-if="overview"
          :color="symmetryColor"
          size="xs"
          variant="soft"
          :label="t(`advanced_storage.cluster.symmetry.${overview.symmetry}`)"
        />
      </div>
    </template>

    <div v-if="loading" class="text-sm text-gray-500 flex items-center gap-2">
      <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
      {{ t('advanced_storage.cluster.loading') }}
    </div>

    <UAlert
      v-else-if="!overview"
      color="amber"
      variant="soft"
      :title="t('advanced_storage.cluster.unavailable_title')"
    />

    <div v-else class="space-y-3">
      <UAlert
        v-for="note in overview.symmetryNotes"
        :key="note"
        color="amber"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :description="t(`advanced_storage.cluster.symmetry_note.${note}`)"
      />

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-xs text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="py-2 pr-3">{{ t('advanced_storage.cluster.col_node') }}</th>
              <th class="pr-3">{{ t('advanced_storage.cluster.col_role') }}</th>
              <th class="pr-3">{{ t('advanced_storage.cluster.col_ssh') }}</th>
              <th class="pr-3">DRBD</th>
              <th class="pr-3">{{ t('advanced_storage.cluster.col_health') }}</th>
              <th class="text-right">{{ t('advanced_storage.cluster.col_action') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr
              v-for="node in overview.nodes"
              :key="node.sanId"
              class="hover:bg-gray-50 dark:hover:bg-gray-950"
              :class="node.sanId === currentSanId ? 'bg-primary-50/50 dark:bg-primary-950/20' : ''"
            >
              <td class="py-2 pr-3 font-medium">{{ node.label }}</td>
              <td class="pr-3 text-xs">{{ clusterRoleLabel(node.clusterRole) }}</td>
              <td class="pr-3">
                <UBadge
                  size="xs"
                  :color="node.sshReady ? 'green' : 'gray'"
                  variant="soft"
                  :label="node.sshReady
                    ? t('advanced_storage.cluster.ssh_ok')
                    : t('advanced_storage.cluster.ssh_down')"
                />
              </td>
              <td class="pr-3 font-mono text-xs">{{ node.drbdResourceCount }}</td>
              <td class="pr-3">
                <UBadge
                  size="xs"
                  :color="healthColor(node.techHealth)"
                  variant="soft"
                  :label="node.techHealth"
                />
              </td>
              <td class="text-right">
                <UButton
                  v-if="node.sanId !== currentSanId"
                  size="xs"
                  variant="ghost"
                  color="primary"
                  @click="emit('select-node', node.sanId)"
                >
                  {{ t('advanced_storage.cluster.view_node') }}
                </UButton>
                <span v-else class="text-xs text-primary-600">{{ t('advanced_storage.cluster.current') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { AdvancedStorageClusterOverview, AdvancedTechHealth } from '~/types/advanced-storage'

const props = defineProps<{
  clusterName: string
  currentSanId: string
  overview: AdvancedStorageClusterOverview | null
  loading: boolean
  clusterRoleLabel: (role: string | null) => string
}>()

const emit = defineEmits<{ 'select-node': [sanId: string] }>()

const { t } = useEsosI18n()

const symmetryColor = computed(() => {
  const s = props.overview?.symmetry
  if (s === 'ok') return 'green'
  if (s === 'warning') return 'amber'
  return 'gray'
})

function healthColor(h: AdvancedTechHealth) {
  if (h === 'ok') return 'green'
  if (h === 'warning') return 'amber'
  if (h === 'critical') return 'red'
  return 'gray'
}
</script>
