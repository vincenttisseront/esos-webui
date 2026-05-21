<template>
  <BaseModal
    :title="title"
    :icon="intent === 'danger' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-lock-closed'"
    :intent="intent ?? 'danger'"
    size="sm"
    :closable="true"
    @cancel="$emit('cancel')"
  >
    <div class="space-y-4">
      <p class="text-ui-base text-gray-700 dark:text-gray-300 leading-relaxed">{{ message }}</p>

      <div class="space-y-1.5">
        <label class="text-ui-sm font-medium text-gray-600 dark:text-gray-400">
          Confirmez votre mot de passe pour continuer
        </label>
        <UInput
          ref="inputRef"
          v-model="password"
          type="password"
          placeholder="Votre mot de passe"
          autofocus
          @keydown.enter="handleConfirm"
        />
      </div>
    </div>

    <template #actions>
      <UButton
        color="gray"
        variant="outline"
        size="sm"
        :label="cancelLabel ?? 'Annuler'"
        @click="$emit('cancel')"
      />
      <UButton
        :color="intent === 'danger' ? 'red' : 'primary'"
        size="sm"
        :label="confirmLabel ?? 'Confirmer'"
        :disabled="!password"
        @click="handleConfirm"
      />
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
defineProps<{
  title:         string
  message:       string
  confirmLabel?: string
  cancelLabel?:  string
  intent?:       'neutral' | 'danger'
}>()

const emit    = defineEmits<{ confirm: [password: string]; cancel: [] }>()
const password = ref('')

function handleConfirm() {
  if (!password.value) return
  emit('confirm', password.value)
}
</script>
