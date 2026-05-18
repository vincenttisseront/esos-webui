<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs text-gray-700 dark:text-gray-300">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase tracking-wide text-[10px]">
          <th class="text-left py-1.5 pr-3">Device</th>
          <th class="text-left py-1.5 pr-3">Rôle</th>
          <th class="text-left py-1.5 pr-3">État</th>
          <th class="text-right py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="member in members"
          :key="member.path ?? `removed-${member.raidDevice ?? member.role ?? member.slot}`"
          class="border-b border-gray-100 dark:border-gray-800"
        >
          <td class="py-1.5 pr-3 font-mono">{{ member.path ?? 'removed' }}</td>
          <td class="py-1.5 pr-3 text-gray-500">{{ member.raidDevice ?? member.role ?? '—' }}</td>
          <td class="py-1.5 pr-3">
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="s in member.state"
                :key="s"
                :color="memberStateColor(s)"
                :label="s"
                size="xs"
                variant="soft"
              />
            </div>
          </td>
          <td class="py-1.5 text-right">
            <div class="flex gap-1 justify-end">
              <UButton
                v-if="!member.state.includes('faulty')"
                :disabled="!member.path"
                size="xs"
                color="amber"
                variant="ghost"
                title="Marquer faulty"
                icon="i-heroicons-exclamation-triangle"
                @click="$emit('set-faulty', member)"
              />
              <UButton
                v-if="member.state.includes('faulty') || member.state.includes('spare')"
                :disabled="!member.path"
                size="xs"
                color="red"
                variant="ghost"
                title="Retirer"
                icon="i-heroicons-x-mark"
                @click="$emit('remove', member)"
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { MdMemberDevice } from '~/types/raid'

defineProps<{ members: MdMemberDevice[] }>()
defineEmits<{
  'set-faulty': [m: MdMemberDevice]
  'remove': [m: MdMemberDevice]
}>()

function memberStateColor(state: string) {
  if (state === 'active' || state === 'sync') return 'green'
  if (state === 'faulty') return 'red'
  if (state === 'spare') return 'blue'
  if (state === 'rebuilding') return 'amber'
  return 'gray'
}
</script>
