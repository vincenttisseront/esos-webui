<script setup lang="ts">
interface SanRow {
  id: string
  label: string
  description: string | null
  host: string
  port: number
  username: string
  driver: string
  status: string
  authType: 'key' | 'password'
  keyFingerprint: string | null
}

const props = defineProps<{
  san: SanRow
  testing?: boolean
}>()

defineEmits<{
  (e: 'test'): void
}>()

const statusColor = computed(() => {
  switch (props.san.status) {
    case 'active':
      return 'green'
    case 'inactive':
      return 'gray'
    case 'error':
      return 'red'
    default:
      return 'gray'
  }
})

const fpShort = computed(() => {
  if (!props.san.keyFingerprint) return null
  const fp = props.san.keyFingerprint
  return fp.length > 24 ? `${fp.slice(0, 22)}…` : fp
})
</script>

<template>
  <div
    class="border rounded-lg p-4 bg-white dark:bg-gray-800 dark:border-gray-700 space-y-2"
  >
    <div class="flex items-start justify-between">
      <div class="min-w-0">
        <div class="font-semibold truncate">{{ san.label }}</div>
        <div v-if="san.description" class="text-xs text-gray-500 dark:text-gray-400 truncate">
          {{ san.description }}
        </div>
      </div>
      <UBadge :color="statusColor">{{ san.status }}</UBadge>
    </div>

    <div class="text-sm space-y-1">
      <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
        <span class="text-gray-400">host</span>
        <span class="font-mono">{{ san.host }}:{{ san.port }}</span>
      </div>
      <div class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
        <span class="text-gray-400">user</span>
        <span class="font-mono">{{ san.username }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-gray-400">auth</span>
        <span>
          <span v-if="san.authType === 'key'">🔑 clé</span>
          <span v-else>🔒 mdp</span>
        </span>
        <span
          v-if="fpShort"
          class="font-mono text-[11px] text-gray-500 dark:text-gray-400 truncate"
          :title="san.keyFingerprint ?? ''"
        >
          {{ fpShort }}
        </span>
      </div>
    </div>

    <div class="flex justify-end pt-2">
      <UButton
        size="xs"
        variant="soft"
        icon="i-heroicons-bolt"
        :loading="testing"
        @click="$emit('test')"
      >
        Tester
      </UButton>
    </div>
  </div>
</template>
