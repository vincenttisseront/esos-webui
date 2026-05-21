<template>
  <!-- Mode "menu" : trois lignes pour le menu utilisateur -->
  <div v-if="mode === 'menu'" class="py-1">
    <p class="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 select-none">
      {{ t('user_menu.theme') }}
    </p>
    <button
      v-for="opt in options"
      :key="opt.code"
      type="button"
      class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      :disabled="busy"
      @click="onSelect(opt.code)"
    >
      <UIcon :name="opt.icon" class="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400" />
      <span class="flex-1 text-left">{{ opt.label }}</span>
      <UIcon
        v-if="preference === opt.code"
        name="i-heroicons-check"
        class="w-4 h-4 text-primary-600 shrink-0"
      />
    </button>
  </div>

  <!-- Mode "profile" : cartes pour la page profil -->
  <div v-else-if="mode === 'profile'" class="grid grid-cols-1 sm:grid-cols-3 gap-2">
    <button
      v-for="opt in options"
      :key="opt.code"
      type="button"
      class="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors"
      :class="preference === opt.code
        ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
        : 'border-gray-200 bg-white text-gray-600 hover:border-primary-200 hover:text-primary-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-primary-600 dark:hover:text-primary-400'"
      :disabled="busy"
      @click="onSelect(opt.code)"
    >
      <span class="flex items-center gap-2">
        <UIcon :name="opt.icon" class="w-4 h-4 shrink-0" />
        <span>{{ opt.label }}</span>
      </span>
      <UIcon
        v-if="preference === opt.code"
        name="i-heroicons-check-circle"
        class="w-4 h-4 text-primary-600 shrink-0"
      />
    </button>
  </div>

  <!-- Mode "compact" : trois boutons pour la page de login -->
  <div
    v-else
    class="inline-flex items-center gap-0.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-0.5"
  >
    <button
      v-for="opt in options"
      :key="opt.code"
      type="button"
      class="px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors"
      :class="preference === opt.code
        ? 'bg-primary-600 text-white'
        : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'"
      :title="opt.label"
      :disabled="busy"
      @click="onSelect(opt.code)"
    >
      <UIcon :name="opt.icon" class="w-3.5 h-3.5" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ThemePreference } from '~/composables/useEsosTheme'

withDefaults(defineProps<{ mode?: 'menu' | 'compact' | 'profile' }>(), {
  mode: 'menu',
})

const emit = defineEmits<{
  (e: 'persistError', error: unknown): void
}>()

const { t } = useEsosI18n()
const { preference, setPreference } = useEsosTheme()
const busy = ref(false)

const options = computed(() => [
  { code: 'light' as ThemePreference, label: t('theme.light'), icon: 'i-heroicons-sun' },
  { code: 'dark' as ThemePreference, label: t('theme.dark'), icon: 'i-heroicons-moon' },
  { code: 'system' as ThemePreference, label: t('theme.system'), icon: 'i-heroicons-computer-desktop' },
])

async function onSelect(code: ThemePreference) {
  if (busy.value || preference.value === code) return
  busy.value = true
  try {
    await setPreference(code)
  } catch (error) {
    emit('persistError', error)
  } finally {
    busy.value = false
  }
}
</script>
