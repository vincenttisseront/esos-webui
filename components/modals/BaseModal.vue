<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-xl shadow-modal w-full relative outline-none"
    :class="sizeClass"
    role="dialog"
    :aria-modal="true"
    :aria-labelledby="labelId"
    @keydown.esc="$emit('cancel')"
    tabindex="-1"
    ref="dialogRef"
  >
    <!-- Header -->
    <div class="flex items-start justify-between px-5 pt-5 pb-0">
      <div class="flex items-start gap-3">
        <!-- Icône optionnelle -->
        <div v-if="icon" class="shrink-0 mt-0.5">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center"
            :class="iconBgClass"
          >
            <UIcon :name="icon" class="w-4 h-4" :class="iconColorClass" />
          </div>
        </div>
        <div>
          <h2 :id="labelId" class="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">
            {{ title }}
          </h2>
          <p v-if="subtitle" class="text-ui-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ subtitle }}</p>
        </div>
      </div>
      <!-- Bouton fermeture (optionnel) -->
      <button
        v-if="closable"
        class="text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors ml-4 shrink-0 -mt-1 -mr-1 p-1 rounded-lg hover:bg-gray-100 dark:bg-gray-800"
        @click="$emit('cancel')"
        :aria-label="t('common.actions.close') as string"
      >
        <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
      </button>
    </div>

    <!-- Corps -->
    <div class="px-5 py-4">
      <slot />
    </div>

    <!-- Footer avec actions -->
    <div v-if="$slots.actions" class="px-5 pb-5 flex justify-end gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const { t } = useEsosI18n()

const props = defineProps<{
  title:     string
  subtitle?: string
  icon?:     string
  intent?:   'neutral' | 'warning' | 'danger' | 'success' | 'info'
  size?:     'sm' | 'md' | 'lg' | 'xl'
  closable?: boolean
}>()

defineEmits(['cancel'])

const dialogRef = ref<HTMLElement>()
const labelId   = useId()

// Focus trap à l'ouverture
onMounted(() => dialogRef.value?.focus())

const sizeClass = computed(() => ({
  'sm': 'max-w-[400px]',
  'md': 'max-w-[560px]',
  'lg': 'max-w-[720px]',
  'xl': 'max-w-[900px]',
}[props.size ?? 'md']))

const iconBgClass = computed(() => ({
  neutral:  'bg-gray-100',
  warning:  'bg-amber-100',
  danger:   'bg-red-100',
  success:  'bg-green-100',
  info:     'bg-blue-100',
}[props.intent ?? 'neutral']))

const iconColorClass = computed(() => ({
  neutral:  'text-gray-600',
  warning:  'text-amber-600',
  danger:   'text-red-600',
  success:  'text-green-600',
  info:     'text-blue-600',
}[props.intent ?? 'neutral']))
</script>
