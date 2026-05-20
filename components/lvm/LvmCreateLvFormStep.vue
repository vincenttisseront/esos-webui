<template>
  <div class="space-y-5">
    <p
      v-if="targetNodeLabels?.length"
      class="text-xs text-gray-600 dark:text-gray-400 rounded-md bg-gray-50 dark:bg-gray-800/50 px-3 py-2"
    >
      {{ t('lvm.wizard.lv_create.target_nodes', { nodes: targetNodeLabels.join(', ') }) }}
    </p>

    <UFormGroup
      :label="t('lvm.wizard.lv_create.vg_label')"
      :hint="vgFreeHint"
    >
      <LvmNativeSelect v-model="vgName" :options="vgOptions" />
    </UFormGroup>

    <UFormGroup
      :label="t('lvm.wizard.lv_create.lv_name_label')"
      :hint="t('lvm.wizard.lv_create.lv_name_help')"
    >
      <UInput v-model="lvName" :placeholder="t('lvm.wizard.lv_create.lv_name_placeholder')" />
    </UFormGroup>

    <UFormGroup
      :label="t('lvm.wizard.lv_create.lv_size_label')"
      :hint="sizeFieldHint"
      :error="sizeError ?? undefined"
    >
      <div class="flex gap-0 max-w-xs">
        <UInput
          v-model.number="sizeGib"
          type="number"
          min="0"
          step="0.1"
          class="flex-1 rounded-r-none"
        />
        <span
          class="inline-flex items-center px-3 text-sm font-medium rounded-r-md border border-l-0 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          aria-hidden="true"
        >
          {{ t('lvm.wizard.lv_create.unit_gib') }}
        </span>
      </div>
    </UFormGroup>

    <div class="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 pt-1 border-t border-gray-100 dark:border-gray-800">
      <p class="text-gray-700 dark:text-gray-300">
        {{ maxSizeLine }}
      </p>
      <p>{{ maxSizeHelp }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatLvmBytes } from '~/utils/lvm-lv-wizard-ui'

const props = defineProps<{
  vgOptions: Array<{ value: string; label: string }>
  maxFreeBytes: number
  clusterMode?: boolean
  targetNodeLabels?: string[]
  sizeError?: string | null
}>()

const vgName = defineModel<string>('vgName', { required: true })
const lvName = defineModel<string>('lvName', { required: true })
const sizeGib = defineModel<number>('sizeGib', { required: true })

const { t } = useEsosI18n()

const vgFreeHint = computed(() => {
  if (!vgName.value) return undefined
  const size = formatLvmBytes(props.maxFreeBytes)
  return props.clusterMode
    ? t('lvm.wizard.lv_create.vg_free_cluster', { size })
    : t('lvm.wizard.lv_create.vg_free_local', { size })
})

const sizeFieldHint = computed(() =>
  props.clusterMode
    ? t('lvm.wizard.lv_create.size_input_help_cluster')
    : t('lvm.wizard.lv_create.size_input_help_local'),
)

const maxSizeLine = computed(() => {
  const size = formatLvmBytes(props.maxFreeBytes)
  return props.clusterMode
    ? t('lvm.wizard.lv_create.size_max_line_cluster', { size })
    : t('lvm.wizard.lv_create.size_max_line_local', { size })
})

const maxSizeHelp = computed(() =>
  props.clusterMode
    ? t('lvm.wizard.lv_create.size_max_help_cluster')
    : t('lvm.wizard.lv_create.size_max_help_local'),
)
</script>
