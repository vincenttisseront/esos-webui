<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden overscroll-contain"
    :style="{ backgroundColor: 'var(--modal-backdrop)' }"
    @mousedown.self="handleBackdropClick"
  >
    <!-- Contenu de la modale (composant dynamique) -->
    <component
      :is="modal.component"
      v-bind="modal.props"
      @confirm="(v?: unknown) => close(modal.id, v ?? true)"
      @cancel="()  => dismiss(modal.id)"
      @close="()   => close(modal.id)"
    />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modal: any }>()
const { close, dismiss } = useAppModal()

function handleBackdropClick() {
  // Fermer sur clic backdrop seulement pour les modales non-destructives
  if (!props.modal.props?.persistent) {
    dismiss(props.modal.id)
  }
}
</script>
