<template>
  <div class="space-y-1">
    <div
      v-for="disk in disks"
      :key="disk.name"
      class="text-sm"
    >
      <!-- Disque racine -->
      <div class="flex items-center gap-2 py-1 font-medium">
        <span class="font-mono">{{ disk.name }}</span>
        <span class="text-gray-500 text-xs">{{ disk.size }}</span>
        <UBadge v-if="disk.readOnly" color="gray" variant="soft" size="xs">{{ t('hardware.diskTree.badgeRo') }}</UBadge>
        <span v-if="disk.mountpoint" class="text-xs text-gray-400 font-mono">{{ disk.mountpoint }}</span>
      </div>

      <!-- Partitions -->
      <div
        v-for="child in disk.children ?? []"
        :key="child.name"
        class="flex items-center gap-2 py-0.5 ml-4 border-l border-gray-200 dark:border-gray-700 pl-3"
      >
        <span class="font-mono text-gray-700 dark:text-gray-300">{{ child.name }}</span>
        <span class="text-gray-400 text-xs">{{ child.size }}</span>
        <UBadge v-if="child.readOnly" color="gray" variant="soft" size="xs">{{ t('hardware.diskTree.badgeRo') }}</UBadge>
        <span v-if="child.mountpoint" class="text-xs text-gray-400 font-mono">{{ child.mountpoint }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BlockDevice } from '~/server/utils/types'

const { t } = useEsosI18n()

defineProps<{ disks: BlockDevice[] }>()
</script>
