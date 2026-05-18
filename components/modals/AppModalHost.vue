<template>
  <Teleport to="body">
    <TransitionGroup name="modal-stack">
      <AppModalEntry
        v-for="modal in stack"
        :key="modal.id"
        :modal="modal"
      />
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
const { stack } = useAppModal()
</script>

<style>
/* Transitions de la pile */
.modal-stack-enter-active { transition: all 160ms ease-out; }
.modal-stack-leave-active  { transition: all 120ms ease-in;  }
.modal-stack-enter-from    { opacity: 0; transform: scale(0.97) translateY(8px); }
.modal-stack-leave-to      { opacity: 0; transform: scale(0.97) translateY(4px);  }
</style>
