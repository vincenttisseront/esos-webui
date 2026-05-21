<template>
  <UButton
    :icon="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard-document'"
    size="2xs"
    color="gray"
    variant="ghost"
    :aria-label="ariaLabel"
    @click="doCopy"
  />
</template>

<script setup lang="ts">
const { t } = useEsosI18n()
const props = defineProps<{ value: string }>()

const { copy, copied, isSupported } = useClipboard({ legacy: true })

const ariaLabel = computed(() =>
  copied.value
    ? (t('common.actions.copied') as string)
    : (t('common.actions.copy') as string),
)

function doCopy() {
  if (!isSupported.value) return
  copy(props.value)
}
</script>
