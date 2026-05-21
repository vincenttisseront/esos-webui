<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-lg shadow border border-gray-200 dark:border-gray-800 overflow-hidden"
  >
    <button
      class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
      @click="open = !open"
    >
      <div class="flex items-center gap-3 flex-wrap">
        <span class="font-semibold text-gray-800 dark:text-gray-100">
          {{ group.name }}
        </span>
        <UBadge color="gray" variant="soft" size="xs">
          {{ t('storage.targets.groupPanel.initiatorsBadge', { count: group.initiators.length }) }}
        </UBadge>
        <UBadge color="blue" variant="soft" size="xs">
          {{ t('storage.targets.groupPanel.lunsBadge', { count: group.luns.length }) }}
        </UBadge>
      </div>
      <span class="text-gray-400 text-xs">{{ open ? '▲' : '▼' }}</span>
    </button>

    <div
      v-if="open"
      class="border-t border-gray-100 dark:border-gray-800 px-4 py-4 space-y-5"
    >
      <div v-if="!readOnly" class="flex flex-wrap gap-2 justify-end">
        <UButton
          size="xs"
          variant="soft"
          icon="i-heroicons-plus"
          :label="t('storage.hosts.actions.addInitiator')"
          @click="$emit('addInitiator', group.name)"
        />
        <UButton
          size="xs"
          color="error"
          variant="outline"
          icon="i-heroicons-trash"
          :label="t('storage.hosts.actions.removeGroup')"
          @click="$emit('removeGroup', group.name)"
        />
      </div>

      <div>
        <p
          class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2"
        >
          {{ t('storage.targets.groupPanel.initiatorsHeading') }}
        </p>
        <ul v-if="group.initiators.length > 0" class="space-y-1">
          <li
            v-for="init in group.initiators"
            :key="init"
            class="flex items-center justify-between gap-2"
          >
            <IqnDisplay :iqn="init" />
            <div class="flex items-center gap-1 shrink-0">
              <CopyButton :value="init" />
              <UButton
                v-if="!readOnly"
                size="xs"
                color="neutral"
                variant="ghost"
                :label="t('storage.hosts.actions.removeInitiator')"
                @click="$emit('removeInitiator', { groupName: group.name, initiator: init })"
              />
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-gray-400 italic">
          {{ t('storage.targets.groupPanel.noInitiators') }}
        </p>
      </div>

      <div>
        <p
          class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2"
        >
          {{ t('storage.targets.groupPanel.lunsHeading') }}
        </p>
        <table v-if="group.luns.length > 0" class="w-full text-sm">
          <thead>
            <tr class="text-xs text-gray-400 uppercase">
              <th class="text-left pb-1">{{ t('storage.targets.groupPanel.lunTableHeaders.id') }}</th>
              <th class="text-left pb-1">{{ t('storage.targets.groupPanel.lunTableHeaders.device') }}</th>
              <th class="text-left pb-1">{{ t('storage.targets.groupPanel.lunTableHeaders.handler') }}</th>
              <th class="text-left pb-1">{{ t('storage.targets.groupPanel.lunTableHeaders.path') }}</th>
              <th class="text-left pb-1">{{ t('storage.targets.groupPanel.lunTableHeaders.ro') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
            <tr v-for="lun in group.luns" :key="lun.id">
              <td class="py-1.5 font-mono text-gray-500 dark:text-gray-400">{{ lun.id }}</td>
              <td class="py-1.5 font-semibold">
                <span>{{ lun.device }}</span>
                <UButton
                  v-if="!readOnly"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="ml-1"
                  :label="t('storage.hosts.actions.unmapLun')"
                  @click="$emit('unmapLun', { groupName: group.name, lunId: lun.id, device: lun.device })"
                />
              </td>
              <td class="py-1.5 text-gray-500 dark:text-gray-400">
                {{ devicesMap.get(lun.device)?.handler ?? '—' }}
              </td>
              <td class="py-1.5 font-mono text-gray-500 dark:text-gray-400 text-xs">
                {{ devicesMap.get(lun.device)?.filename ?? '—' }}
              </td>
              <td class="py-1.5">
                <UBadge
                  v-if="lun.readOnly"
                  color="orange"
                  variant="soft"
                  :label="t('storage.targets.groupPanel.readOnlyBadge')"
                  size="xs"
                />
                <span v-else class="text-gray-300">—</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-sm text-gray-400 italic">
          {{ t('storage.targets.groupPanel.noLuns') }}
        </p>
        <div v-if="!readOnly" class="mt-2">
          <UButton
            size="xs"
            variant="outline"
            icon="i-heroicons-link"
            :label="t('storage.hosts.actions.assignLun')"
            @click="$emit('mapLun', group.name)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Group } from '~/types/esos'

const { t } = useEsosI18n()

defineProps<{
  group: Group
  devicesMap: Map<string, { handler: string; filename: string }>
  readOnly?: boolean
}>()

defineEmits<{
  addInitiator: [groupName: string]
  removeInitiator: [payload: { groupName: string; initiator: string }]
  removeGroup: [groupName: string]
  mapLun: [groupName: string]
  unmapLun: [payload: { groupName: string; lunId: number; device: string }]
}>()

const open = ref(true)
</script>
