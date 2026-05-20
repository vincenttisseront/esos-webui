<template>
  <UFormGroup
    :label="t('lvm.wizard.pv_create.device')"
    :hint="t('lvm.wizard.pv_create.device_help')"
  >
    <LvmNativeSelect
      v-if="options.length"
      :model-value="modelValue"
      :options="options"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div
      v-else
      class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-3 space-y-2"
    >
      <p class="text-sm text-amber-900 dark:text-amber-100">
        {{ t('lvm.wizard.pv_create.no_eligible') }}
      </p>
      <UButton
        v-if="onNavigateBlockDevices"
        size="xs"
        color="amber"
        variant="soft"
        icon="i-heroicons-circle-stack"
        @click="onNavigateBlockDevices"
      >
        {{ t('lvm.wizard.pv_create.open_block_devices') }}
      </UButton>
    </div>
  </UFormGroup>
</template>

<script setup lang="ts">
import type { LvmCandidateDevice } from '~/types/lvm'
import { toPvCreateDeviceOptions } from '~/utils/lvm-wizard-ui'

const props = defineProps<{
  modelValue: string
  candidates: LvmCandidateDevice[]
  onNavigateBlockDevices?: () => void
}>()

const emit = defineEmits<{ 'update:modelValue': [string] }>()
const { t } = useEsosI18n()

const options = computed(() => toPvCreateDeviceOptions(props.candidates))
</script>
