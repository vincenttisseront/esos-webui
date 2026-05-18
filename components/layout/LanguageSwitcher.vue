<template>
  <!-- Mode "menu" : deux lignes cliquables FR/EN avec une coche sur l'actif.
       Conçu pour être intégré dans un UDropdown (slot personnalisé). -->
  <div v-if="mode === 'menu'" class="py-1">
    <p class="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 select-none">
      {{ t('user_menu.language') }}
    </p>
    <button
      v-for="opt in options"
      :key="opt.code"
      type="button"
      class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      :disabled="busy"
      @click="onSelect(opt.code)"
    >
      <span class="text-xs font-mono w-6 shrink-0 uppercase text-gray-500 dark:text-gray-400">{{ opt.code }}</span>
      <span class="flex-1 text-left">{{ opt.label }}</span>
      <UIcon
        v-if="locale === opt.code"
        name="i-heroicons-check"
        class="w-4 h-4 text-primary-600 shrink-0"
      />
    </button>
  </div>

  <!-- Mode "profile" : cartes pleine largeur pour la page profil. -->
  <div v-else-if="mode === 'profile'" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
    <button
      v-for="opt in options"
      :key="opt.code"
      type="button"
      class="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors"
      :class="locale === opt.code
        ? 'border-primary-300 bg-primary-50 text-primary-700'
        : 'border-gray-200 bg-white text-gray-600 hover:border-primary-200 hover:text-primary-600'"
      :disabled="busy"
      @click="onSelect(opt.code)"
    >
      <span class="flex items-center gap-2">
        <span class="font-mono text-xs uppercase">{{ opt.code }}</span>
        <span>{{ opt.label }}</span>
      </span>
      <UIcon
        v-if="locale === opt.code"
        name="i-heroicons-check-circle"
        class="w-4 h-4 text-primary-600 shrink-0"
      />
    </button>
  </div>

  <!-- Mode "compact" : pilule FR | EN. Pensé pour la page de login. -->
  <div v-else class="inline-flex items-center gap-0.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-0.5">
    <button
      v-for="opt in options"
      :key="opt.code"
      type="button"
      class="px-2.5 py-0.5 text-xs font-medium uppercase rounded-full transition-colors"
      :class="locale === opt.code
        ? 'bg-primary-600 text-white'
        : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'"
      :disabled="busy"
      @click="onSelect(opt.code)"
    >
      {{ opt.code }}
    </button>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ mode?: 'menu' | 'compact' | 'profile' }>(), {
  mode: 'menu',
})

const emit = defineEmits<{
  (e: 'persistError', error: unknown): void
}>()

const { t, locale, setLocale } = useEsosI18n()
const authStore = useAuthStore()
const busy = ref(false)

const options = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
] as const

async function onSelect(code: string) {
  if (busy.value || locale.value === code) return
  busy.value = true
  try {
    await setLocale(code)
    if (authStore.isAuthenticated) {
      await authStore.setPreferredLocale(code).catch((error) => {
        // Échec silencieux : la préférence reste dans le cookie côté client.
        emit('persistError', error)
      })
    }
  } finally {
    busy.value = false
  }
}
</script>
