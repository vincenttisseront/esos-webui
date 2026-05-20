<template>
  <UCard>
    <template #header>
      <h3 class="text-sm font-medium">{{ t('lvm.provisioning.next.title') }}</h3>
    </template>
    <div class="space-y-3">
      <p class="text-sm text-gray-700 dark:text-gray-300">
        {{ messageText }}
      </p>
      <div v-if="showCta" class="flex flex-wrap gap-2">
        <UButton
          size="sm"
          color="primary"
          :disabled="!canMutate"
          @click="$emit('action', action!.action!)"
        >
          {{ action.actionLabelKey ? t(action.actionLabelKey) : '' }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { LvmNextAction } from '~/utils/lvm-provisioning-chain'

const props = defineProps<{
  action: LvmNextAction
  canMutate: boolean
}>()

defineEmits<{
  action: [kind: NonNullable<LvmNextAction['action']>]
}>()

const { t } = useEsosI18n()

const messageText = computed(() => {
  const params = props.action.messageParams ?? {}
  return t(props.action.messageKey, params)
})

const showCta = computed(() =>
  props.canMutate
  && props.action.action
  && props.action.actionLabelKey
  && !['complete', 'readonly', 'blocked'].includes(props.action.kind),
)
</script>
