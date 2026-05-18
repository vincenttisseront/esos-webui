<template>
  <div
    class="rounded-xl border bg-white overflow-hidden"
    :class="danger ? 'border-red-200' : 'border-gray-200'"
  >
    <!-- En-tête section -->
    <div
      class="flex items-center gap-2 px-5 py-3 border-b"
      :class="danger ? 'border-red-100 bg-red-50' : 'border-gray-100 bg-gray-50'"
    >
      <UIcon :name="icon" class="w-4 h-4" :class="danger ? 'text-red-500' : 'text-gray-500'" />
      <h2 class="text-sm font-semibold" :class="danger ? 'text-red-700' : 'text-gray-700'">
        {{ title }}
      </h2>
    </div>
    <!-- Contenu -->
    <div class="px-5 py-4">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; icon: string; danger?: boolean }>()
</script>
