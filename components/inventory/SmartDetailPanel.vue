<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <div>
        <p class="font-semibold text-gray-800">/dev/{{ disk.name }}</p>
        <p class="text-xs text-gray-400 mt-0.5">{{ disk.model }}{{ disk.serial ? ` · ${disk.serial}` : '' }}</p>
      </div>
      <UButton size="xs" variant="ghost" icon="i-heroicons-x-mark" @click="$emit('close')" />
    </div>

    <div class="flex items-center gap-3 mb-4">
      <SmartHealthBadge :smart="disk.smart!" />
      <span class="text-sm text-gray-500">
        <template v-if="disk.smart!.temperature != null">{{ disk.smart!.temperature }}°C · </template>
        {{ disk.smart!.powerOnHours != null ? `${disk.smart!.powerOnHours} h de fonctionnement` : '' }}
      </span>
    </div>

    <!-- ATA attributes -->
    <template v-if="disk.smart!.attributes?.length">
      <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Attributs SMART</h4>
      <div class="overflow-x-auto">
        <table class="w-full text-xs font-mono">
          <thead>
            <tr class="text-gray-400 border-b border-gray-100">
              <th class="text-left py-1 pr-3">#</th>
              <th class="text-left py-1 pr-3">Attribut</th>
              <th class="text-right py-1 pr-3">Valeur</th>
              <th class="text-right py-1 pr-3">Seuil</th>
              <th class="text-right py-1">Brut</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="attr in disk.smart!.attributes"
              :key="attr.id"
              :class="['border-b border-gray-50', attr.failing ? 'text-red-600' : '']"
            >
              <td class="py-1 pr-3 text-gray-400">{{ attr.id }}</td>
              <td class="py-1 pr-3">{{ attr.name }}</td>
              <td class="py-1 pr-3 text-right">{{ attr.value }}</td>
              <td class="py-1 pr-3 text-right">{{ attr.threshold }}</td>
              <td class="py-1 text-right">{{ attr.rawValue }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <p v-else class="text-xs text-gray-400 italic">Aucun attribut SMART disponible</p>
  </div>
</template>

<script setup lang="ts">
import type { DiskDevice } from '~/server/utils/types'

defineProps<{ disk: DiskDevice & { smart: NonNullable<DiskDevice['smart']> } }>()
defineEmits(['close'])
</script>
