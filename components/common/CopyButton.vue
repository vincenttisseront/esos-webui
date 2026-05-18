<template>
  <UButton
    :icon="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard-document'"
    size="2xs"
    color="gray"
    variant="ghost"
    :aria-label="copied ? 'Copié' : 'Copier'"
    @click="doCopy"
  />
</template>

<script setup lang="ts">
const props = defineProps<{ value: string }>()

const { copy, copied, isSupported } = useClipboard({ legacy: true })

function doCopy() {
  if (!isSupported.value) return
  copy(props.value)
}
</script>
