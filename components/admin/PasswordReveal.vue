<template>
  <div class="flex items-center gap-2">
    <code
      class="flex-1 font-mono text-sm bg-gray-50 border border-gray-200 rounded px-3 py-1.5 text-gray-800 select-all"
    >
      {{ visible ? password : '•'.repeat(password.length) }}
    </code>
    <UButton
      size="xs"
      color="gray"
      variant="outline"
      :icon="visible ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
      :aria-label="visible ? 'Masquer' : 'Afficher'"
      @click="visible = !visible"
    />
    <CopyButton :value="password" size="xs" />
  </div>
</template>

<script setup lang="ts">
defineProps<{ password: string }>()
const visible = ref(false)
</script>
