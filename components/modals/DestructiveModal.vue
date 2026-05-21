<template>
  <BaseModal
    :title="t('storage.common.destructiveModal.frameTitle')"
    icon="i-heroicons-exclamation-triangle"
    intent="danger"
    size="sm"
    :closable="true"
    @cancel="$emit('cancel')"
  >
    <div class="space-y-4">
      <p class="text-ui-base text-gray-700 dark:text-gray-300 font-medium">{{ title }}</p>
      <p class="text-ui-sm text-gray-500 dark:text-gray-400 leading-relaxed">{{ message }}</p>

      <!-- Saisie de confirmation si inputConfirm défini -->
      <div v-if="inputConfirm" class="mt-3 space-y-2">
        <p class="text-ui-sm text-gray-600 dark:text-gray-400">
          {{ t('storage.common.destructiveModal.typeToConfirmBefore') }}
          <span class="font-identifier font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">{{ inputConfirm }}</span>
          {{ t('storage.common.destructiveModal.typeToConfirmAfter') }}
        </p>
        <UInput
          v-model="typedConfirm"
          :placeholder="inputConfirm"
          class="font-identifier"
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
        :label="cancelLabel ?? (t('storage.common.destructiveModal.cancelDefault') as string)"
        @click="$emit('cancel')"
      />
      <UButton
        color="red"
        size="sm"
        :label="confirmLabel ?? (t('storage.common.destructiveModal.confirmDefault') as string)"
        :disabled="inputConfirm ? typedConfirm !== inputConfirm : false"
        @click="handleConfirm"
      />
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()

const props = defineProps<{
  title:         string
  message:       string
  confirmLabel?: string
  cancelLabel?:  string
  inputConfirm?: string   // Texte que l'utilisateur doit taper pour valider
}>()

const emit         = defineEmits(['confirm', 'cancel'])
const typedConfirm = ref('')

function handleConfirm() {
  if (props.inputConfirm && typedConfirm.value !== props.inputConfirm) return
  emit('confirm')
}
</script>
